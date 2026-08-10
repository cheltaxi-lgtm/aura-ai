"use client";

export type WaitForAsyncJobOptions = {
  jobId: string;
  /** localStorage key prefix, e.g. "aura:reading-active-job" */
  storageKey: string;
  startedAtKey?: string;
  maxAgeMs?: number;
  maxAttempts?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  /** Live status updates (queue position, server message, progress) for premium UI. */
  onUpdate?: (update: {
    status: string;
    queuePosition: number | null;
    clientMessage?: string;
    progress?: AsyncJobProgress;
    heartbeatAt?: string | null;
  }) => void;
};

export type AsyncJobProgress = {
  done?: number;
  total?: number;
  label?: string;
  stage?: string;
  message?: string;
};

export type AsyncJobPollResult = {
  jobId?: string;
  kind?: string;
  status: string;
  result?: Record<string, unknown>;
  error?: string;
  refunded?: boolean;
  billingState?: string;
  outputEntityId?: string | null;
  queuePosition?: number | null;
  clientMessage?: string;
  progress?: AsyncJobProgress;
  heartbeatAt?: string | null;
};

/** 202 envelope for heavy reports when background delivery is enabled. */
export type AcceptedAsyncReport = {
  jobId: string;
  pollUrl: string;
  kind?: string;
  waitPolicy: "background_notified";
  etaRangeSec: { min: number; max: number } | null;
  productTitle?: string;
  destination: string | null;
};

/**
 * Detect the "Отчёт принят" envelope from any enqueue response (202 or the
 * Pro 200 wrapper). Returns null for classic blocking flows — old behaviour.
 */
export function parseAcceptedAsyncReport(data: unknown): AcceptedAsyncReport | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.jobId !== "string" || !o.jobId) return null;
  if (o.waitPolicy !== "background_notified") return null;
  const etaRaw = o.etaRangeSec;
  const eta =
    etaRaw &&
    typeof etaRaw === "object" &&
    typeof (etaRaw as Record<string, unknown>).min === "number" &&
    typeof (etaRaw as Record<string, unknown>).max === "number"
      ? (etaRaw as { min: number; max: number })
      : null;
  return {
    jobId: o.jobId,
    pollUrl: typeof o.pollUrl === "string" ? o.pollUrl : `/api/jobs/${o.jobId}`,
    kind: typeof o.kind === "string" ? o.kind : undefined,
    waitPolicy: "background_notified",
    etaRangeSec: eta,
    productTitle: typeof o.productTitle === "string" ? o.productTitle : undefined,
    destination: typeof o.destination === "string" ? o.destination : null,
  };
}

async function responseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Poll durable `/api/jobs/:id` with refresh-resume via localStorage.
 * Survives brief 502/503/504 and network blips without abandoning the job.
 */
export async function waitForAsyncJob(
  options: WaitForAsyncJobOptions
): Promise<Record<string, unknown>> {
  const {
    jobId,
    storageKey,
    startedAtKey = `${storageKey}-started`,
    maxAgeMs = 45 * 60_000,
    maxAttempts = 180,
    pollIntervalMs = 2_000,
    signal,
  } = options;

  let terminal = false;
  let authFailures = 0;
  let transientFailures = 0;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, jobId);
    if (!window.localStorage.getItem(startedAtKey)) {
      window.localStorage.setItem(startedAtKey, String(Date.now()));
    }
  }

  try {
    if (typeof window !== "undefined") {
      const startedAt = Number(window.localStorage.getItem(startedAtKey) || Date.now());
      if (Number.isFinite(startedAt) && Date.now() - startedAt > maxAgeMs) {
        terminal = true;
        throw new Error(
          "Сохранённая генерация устарела. Запустите снова при необходимости."
        );
      }
    }

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (signal?.aborted) {
        throw new Error("Ожидание генерации отменено.");
      }

      let response: Response;
      try {
        response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          credentials: "include",
          cache: "no-store",
          signal,
        });
      } catch {
        if (signal?.aborted) throw new Error("Ожидание генерации отменено.");
        transientFailures += 1;
        if (transientFailures <= 15) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(10_000, 1_000 * transientFailures))
          );
          continue;
        }
        terminal = false;
        throw new Error(
          "Разбор продолжается на сервере — результат сохранится в кабинете. Проверьте связь и вернитесь: ожидание продолжится автоматически."
        );
      }

      if (
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      ) {
        transientFailures += 1;
        if (transientFailures <= 15) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(15_000, retryAfter * 1_000)
                : Math.min(10_000, 1_000 * transientFailures)
            )
          );
          continue;
        }
        terminal = false;
        throw new Error(
          "Разбор продолжается на сервере, но статус временно недоступен. Он появится в кабинете — повторного списания не будет."
        );
      }

      const job = await responseJson<AsyncJobPollResult>(response);
      if (response.status === 404) {
        terminal = true;
        throw new Error("Задача генерации не найдена. Запустите снова.");
      }
      if (response.status === 401) {
        authFailures += 1;
        if (authFailures <= 5) {
          await new Promise((resolve) => setTimeout(resolve, 1_000 * authFailures));
          continue;
        }
        terminal = false;
        throw new Error(
          "Разбор готовится на сервере, но вход нужно подтвердить. Войдите снова — ожидание продолжится автоматически."
        );
      }
      authFailures = 0;
      transientFailures = 0;
      if (!response.ok) {
        throw new Error(job.error || "Не удалось проверить статус генерации.");
      }
      if (job.status === "completed") {
        terminal = true;
        return job.result ?? {};
      }
      if (job.status === "needs_regeneration") {
        terminal = true;
        throw new Error(
          typeof job.error === "string" && job.error.trim()
            ? job.error
            : "Разбор проходит дополнительную проверку качества. Повторного списания рун не будет — сообщим, когда всё будет готово."
        );
      }
      if (job.status === "failed") {
        terminal = true;
        const errText = typeof job.error === "string" ? job.error.trim() : "";
        // Preserve billing failure codes so callers can open paywall (402 path).
        if (/insufficient(_runes)?/i.test(errText) || job.error === "insufficient_runes") {
          throw new Error("insufficient_runes");
        }
        const fallback = job.refunded
          ? "Не удалось завершить разбор. Руны уже возвращены на ваш баланс."
          : "Разбор столкнулся с технической сложностью. Если он не перезапустится автоматически, руны будут возвращены.";
        throw new Error(errText || fallback);
      }
      options.onUpdate?.({
        status: job.status,
        queuePosition: typeof job.queuePosition === "number" ? job.queuePosition : null,
        clientMessage: typeof job.clientMessage === "string" ? job.clientMessage : undefined,
        progress: job.progress,
        heartbeatAt: typeof job.heartbeatAt === "string" ? job.heartbeatAt : null,
      });
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    terminal = false;
    throw new Error(
      "Разбор всё ещё готовится на сервере. Он появится в кабинете — придёт уведомление."
    );
  } finally {
    if (terminal && typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(startedAtKey);
    }
  }
}

export function readStoredAsyncJobId(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(storageKey)?.trim();
  return value || null;
}

export function clearStoredAsyncJob(
  storageKey: string,
  startedAtKey = `${storageKey}-started`
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
  window.localStorage.removeItem(startedAtKey);
}

/** Resume any active server-side job for the current user (localStorage lost). */
export async function fetchActiveAsyncJobs(
  kind?: string
): Promise<AsyncJobPollResult[]> {
  const url = kind
    ? `/api/jobs/active?kind=${encodeURIComponent(kind)}`
    : "/api/jobs/active";
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) return [];
  const data = await responseJson<{ jobs?: AsyncJobPollResult[] }>(response);
  return Array.isArray(data.jobs) ? data.jobs : [];
}

/**
 * POST that may return 202 + jobId. Polls until the job result is ready.
 */
export async function postWithAsyncJob(params: {
  url: string;
  body: Record<string, unknown>;
  storageKey: string;
  /** Abort for the initial enqueue POST only. */
  signal?: AbortSignal;
  /** Abort for job polling; defaults to `signal` when omitted. */
  pollSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.headers ?? {}),
    },
    credentials: "include",
    signal: params.signal,
    body: JSON.stringify({ ...params.body, async: true }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 202 && typeof data.jobId === "string") {
    const result = await waitForAsyncJob({
      jobId: data.jobId,
      storageKey: params.storageKey,
      signal: params.pollSignal ?? params.signal,
    });
    return { status: 200, data: result };
  }

  return { status: res.status, data };
}

/**
 * Resume a job from localStorage or `/api/jobs/active`.
 * Returns null when nothing active; otherwise polls to completion.
 */
export async function resumeStoredOrActiveAsyncJob(params: {
  storageKey: string;
  kind?: string;
  signal?: AbortSignal;
}): Promise<Record<string, unknown> | null> {
  let jobId = readStoredAsyncJobId(params.storageKey);
  if (!jobId && params.kind) {
    const jobs = await fetchActiveAsyncJobs(params.kind);
    const active = jobs.find(
      (job) =>
        typeof job.jobId === "string" &&
        (job.status === "pending" || job.status === "running" || job.status === "claimed")
    );
    jobId = active?.jobId ?? null;
  }
  if (!jobId) return null;
  return waitForAsyncJob({
    jobId,
    storageKey: params.storageKey,
    signal: params.signal,
  });
}
