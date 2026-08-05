import { postWithAsyncJob } from "@/lib/client/wait-for-async-job";

/** Enqueue POST only — must stay short so a dead API fails fast. */
export const INTENTION_SPREAD_POST_TIMEOUT_MS = 45_000;

/**
 * Poll budget after 202 — must exceed worker generation (LLM + repair/rescue).
 * Recent prod jobs finished ~3 min; keep headroom under async-job stale reap (~4 min).
 */
export const INTENTION_SPREAD_WAIT_TIMEOUT_MS = 300_000;

/** @deprecated Use INTENTION_SPREAD_WAIT_TIMEOUT_MS — kept for call-site compatibility. */
export const INTENTION_SPREAD_POLL_TIMEOUT_MS = INTENTION_SPREAD_WAIT_TIMEOUT_MS;

/** Poll saved spread after POST abort — server may still finish and persist to history. */
export const INTENTION_SPREAD_POLL_INTERVAL_MS = 2_500;
export const INTENTION_SPREAD_POLL_MAX_ATTEMPTS = 28;
/** Short recovery only — never leave the ritual spinning for a minute after a terminal fail. */
export const INTENTION_SPREAD_RECOVERY_POLL_MAX_ATTEMPTS = 3;
/** Longer recovery when the client wait aborted but the worker may still finish. */
export const INTENTION_SPREAD_LATE_RECOVERY_POLL_MAX_ATTEMPTS = 24;

export function isTerminalIntentionSpreadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /не удалось завершить трактовку|generation_failed|intention_spread_ai_failed|intention_spread_failed|трактовк|приглашение не найдено|истекло/i.test(
    msg
  );
}

/** Prefer server `error` text; never surface opaque internal keys to the user. */
export function resolveIntentionSpreadFailureMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message.trim() : String(err ?? "").trim();
  if (!raw || raw === "intention_spread_failed") {
    return "Не удалось завершить трактовку. Попробуйте ещё раз.";
  }
  if (/insufficient(_runes)?/i.test(raw)) {
    return "Недостаточно рун для этого расклада. Пополните баланс и попробуйте снова.";
  }
  if (/^[a-z][a-z0-9_]+$/i.test(raw)) {
    return "Не удалось завершить трактовку. Попробуйте ещё раз.";
  }
  return raw;
}

export function isInsufficientRunesIntentionError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message.trim() : String(err ?? "").trim();
  return /insufficient(_runes)?/i.test(raw);
}

export async function intentionSpreadResponseError(response: Response): Promise<Error> {
  const data = (await response.json().catch(() => ({}))) as { error?: unknown };
  const apiError = typeof data.error === "string" ? data.error.trim() : "";
  if (apiError) return new Error(apiError);
  return new Error("intention_spread_failed");
}

export function isIntentionSpreadWaitAborted(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /abort|отмен/i.test(msg);
}

export const INTENTION_SPREAD_JOB_STORAGE_KEY = "aura:intention-spread-active-job";

export type IntentionSpreadPollParams = {
  characterId: string;
  intention: string;
  cardNames: string[];
  spreadId?: string;
  cardCount?: number;
  /** Current consultation — required to avoid flashing a previous same-card reading. */
  sessionId?: string | null;
};

/** Read completed intention spread from server history (no billing). */
export async function pollIntentionSpreadReading(
  params: IntentionSpreadPollParams,
  options?: { maxAttempts?: number; intervalMs?: number }
): Promise<string | null> {
  const maxAttempts = options?.maxAttempts ?? INTENTION_SPREAD_POLL_MAX_ATTEMPTS;
  const intervalMs = options?.intervalMs ?? INTENTION_SPREAD_POLL_INTERVAL_MS;
  const required = params.cardCount ?? params.cardNames.filter(Boolean).length;
  const cards = params.cardNames.filter(Boolean).slice(0, required);
  if (cards.length < required || required < 1) return null;

  // Custom / paid recovery without a session id would match any prior same-card reading.
  const sessionId = params.sessionId?.trim() || "";
  if (params.intention === "custom" && !sessionId) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    try {
      const qs = new URLSearchParams({
        poll: "1",
        characterId: params.characterId,
        intention: params.intention,
        cards: cards.join("|"),
      });
      if (params.spreadId) qs.set("spreadId", params.spreadId);
      if (sessionId) qs.set("sessionId", sessionId);
      const res = await fetch(`/api/intention-spread?${qs}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { reading?: string; found?: boolean };
      const text = typeof data.reading === "string" ? data.reading.trim() : "";
      if (text.length >= 80) return text;
    } catch {
      /* retry */
    }
  }
  return null;
}

/**
 * Client-side POST with durable async job + poll.
 * Returns a Response-like object so existing call sites keep working.
 * Retries only transient transport failures — never re-bills / re-queues a terminal AI fail.
 */
export async function postIntentionSpreadRequest(
  body: Record<string, unknown>,
  options?: {
    retries?: number;
    /** Enqueue POST timeout (default 45s). */
    timeoutMs?: number;
    /** Job poll timeout (default 300s). */
    waitTimeoutMs?: number;
    signal?: AbortSignal;
  }
): Promise<Response> {
  const retries = Math.max(1, options?.retries ?? 2);
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    const enqueueController = new AbortController();
    const waitController = new AbortController();
    const enqueueTimeoutMs = options?.timeoutMs ?? INTENTION_SPREAD_POST_TIMEOUT_MS;
    const waitTimeoutMs = options?.waitTimeoutMs ?? INTENTION_SPREAD_WAIT_TIMEOUT_MS;
    const enqueueTimer = setTimeout(() => enqueueController.abort(), enqueueTimeoutMs);
    const waitTimer = setTimeout(() => waitController.abort(), waitTimeoutMs);
    const onOuterAbort = () => {
      enqueueController.abort();
      waitController.abort();
    };
    options?.signal?.addEventListener("abort", onOuterAbort);

    try {
      const { status, data } = await postWithAsyncJob({
        url: "/api/intention-spread",
        body,
        storageKey: INTENTION_SPREAD_JOB_STORAGE_KEY,
        signal: enqueueController.signal,
        pollSignal: waitController.signal,
      });
      clearTimeout(enqueueTimer);
      clearTimeout(waitTimer);
      options?.signal?.removeEventListener("abort", onOuterAbort);

      if (status === 402 || status < 500) {
        return new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }

      // 5xx from route itself (rare with async jobs) — retry once.
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      clearTimeout(enqueueTimer);
      clearTimeout(waitTimer);
      options?.signal?.removeEventListener("abort", onOuterAbort);
      lastError = err;
      // Async poller surfaces billing failures as thrown codes — map back to 402.
      if (isInsufficientRunesIntentionError(err)) {
        return new Response(
          JSON.stringify({
            error: "insufficient_runes",
            code: "insufficient_runes",
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
      // Job already failed or cancelled — do NOT enqueue a second paid job.
      if (isTerminalIntentionSpreadError(err) || options?.signal?.aborted) {
        break;
      }
      const aborted = isIntentionSpreadWaitAborted(err);
      if (aborted) break;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("intention_spread_failed");
}
