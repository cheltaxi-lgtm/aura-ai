import { postWithAsyncJob } from "@/lib/client/wait-for-async-job";

/** POST timeout — must exceed server LLM queue + generation (up to ~120s under load). */
export const INTENTION_SPREAD_POST_TIMEOUT_MS = 150_000;

/** Poll saved spread after POST abort — server may still finish and persist to history. */
export const INTENTION_SPREAD_POLL_INTERVAL_MS = 2_500;
export const INTENTION_SPREAD_POLL_MAX_ATTEMPTS = 28;

export const INTENTION_SPREAD_JOB_STORAGE_KEY = "aura:intention-spread-active-job";

export type IntentionSpreadPollParams = {
  characterId: string;
  intention: string;
  cardNames: string[];
  spreadId?: string;
  cardCount?: number;
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
 */
export async function postIntentionSpreadRequest(
  body: Record<string, unknown>,
  options?: { retries?: number; timeoutMs?: number; signal?: AbortSignal }
): Promise<Response> {
  const retries = Math.max(1, options?.retries ?? 2);
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? INTENTION_SPREAD_POST_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onOuterAbort);

    try {
      const { status, data } = await postWithAsyncJob({
        url: "/api/intention-spread",
        body,
        storageKey: INTENTION_SPREAD_JOB_STORAGE_KEY,
        signal: controller.signal,
      });
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onOuterAbort);

      if (status === 402 || status < 500) {
        return new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }

      return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onOuterAbort);
      lastError = err;
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("intention_spread_failed");
}
