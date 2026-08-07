import { hostname } from "node:os";
import { Agent, fetch as undiciFetch } from "undici";

import {
  assertLoopbackAppUrl,
  WORKER_JOB_HEADER,
  WORKER_SECRET_HEADER,
  WORKER_USER_HEADER,
} from "../src/lib/async-job-worker-auth-shared";
import {
  ASYNC_JOB_REGISTRY,
  endpointForJob,
  getJobKindConfig,
  resolveWorkerKindsFromEnv,
} from "../src/lib/async-job-registry";
import {
  claimAsyncJobs,
  completeAsyncJob,
  failAsyncJobAndRefundIfCharged,
  finalizeAsyncJobMetrics,
  getAsyncJobById,
  markAsyncJobNeedsRegeneration,
  reapOrphanedRunningAsyncJobs,
  reapStaleRunningAsyncJobs,
  rescheduleAsyncJob,
  type AsyncJobKind,
  type AsyncJobRow,
} from "../src/lib/async-jobs";
import { runReportJobInProcess } from "../src/lib/async-job-runners";
import {
  getReportCircuitBreakerStats,
  isReportClaimPaused,
  recordReportProviderFailure,
  recordReportProviderSuccess,
} from "../src/lib/async-report-circuit-breaker";
import {
  isAsyncReportInProcessEnabled,
  isReportJobKind,
  reportKindsAsAsyncJobKinds,
} from "../src/lib/async-report-flags";
import {
  ctaPathForReportKind,
  notifyPaidReportReady,
} from "../src/lib/async-report-notify";
import {
  persistAsyncWorkerHealth,
  probeOpenRouterFromWorker,
  type AsyncWorkerHealth,
} from "../src/lib/async-worker-health";
import { processMemoryExtractionJobs } from "../src/lib/memory/client-memory";

const PROVIDER_PROBE_MS = Math.max(
  60_000,
  Number(process.env.ASYNC_WORKER_OR_PROBE_MS) || 5 * 60_000
);
let lastProviderHealth: AsyncWorkerHealth | null = null;
let providerProbeInFlight: Promise<void> | null = null;

async function runProviderProbe(reason: string): Promise<void> {
  if (providerProbeInFlight) return providerProbeInFlight;
  providerProbeInFlight = (async () => {
    const health = await probeOpenRouterFromWorker(workerId);
    lastProviderHealth = health;
    try {
      await persistAsyncWorkerHealth(health);
    } catch (error) {
      console.error("[async-jobs] persist provider health failed:", error);
    }
    if (health.ok) {
      console.log(
        `[async-jobs] OpenRouter OK via proxy=${health.proxyUrlHost} latencyMs=${health.latencyMs} (${reason})`
      );
      recordReportProviderSuccess();
    } else {
      console.error(
        `[async-jobs] OpenRouter UNAVAILABLE proxy=${health.proxyUrlHost} error=${health.error} (${reason})`
      );
      recordReportProviderFailure("other");
    }
  })().finally(() => {
    providerProbeInFlight = null;
  });
  return providerProbeInFlight;
}

async function maybeNotifyReportReady(
  job: AsyncJobRow,
  result: Record<string, unknown>
): Promise<void> {
  if (!isReportJobKind(job.kind)) return;
  const ctaPath = ctaPathForReportKind(job.kind, result);
  if (!ctaPath) return;
  const titles: Record<string, string> = {
    hd_report: "Разбор Human Design готов",
    hd_composite_report: "Разбор связи Human Design готов",
    pro_premium_report: "Pro-отчёт готов",
    numerology_reading: "Матрица готова",
    natal_interpretation: "Натальный разбор готов",
    natal_forecast: "Натальный прогноз готов",
    natal_compatibility: "Натальная совместимость готова",
  };
  void notifyPaidReportReady({
    userId: job.user_id,
    kind: job.kind,
    title: titles[job.kind] ?? "Отчёт готов",
    ctaPath,
  });
}

const POLL_INTERVAL_MS = Math.max(250, Number(process.env.ASYNC_JOB_POLL_MS) || 1_000);
const MEMORY_POLL_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.MEMORY_JOB_POLL_MS) || 3_000
);
const MEMORY_BATCH_SIZE = Math.min(
  10,
  Math.max(1, Number(process.env.MEMORY_JOB_BATCH_SIZE) || 3)
);
/** Non-report lane. pending Phase 0 calibration */
const OTHER_CONCURRENCY = Math.min(
  10,
  Math.max(1, Number(process.env.ASYNC_JOB_CONCURRENCY) || 4)
);
/** Report lane. pending Phase 0 calibration — Phase 0: 2-core / 3.8Gi VM → start at 2 */
const REPORT_CONCURRENCY = Math.min(
  5,
  Math.max(1, Number(process.env.ASYNC_REPORT_CONCURRENCY) || 2)
);

const REQUEST_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.ASYNC_JOB_REQUEST_TIMEOUT_MS) || 280_000
);
const LONGEST_KIND_TIMEOUT_MS = Math.max(
  ...Object.values(ASYNC_JOB_REGISTRY).map((k) => k.timeoutMs)
);
const STALE_RUNNING_MS = Math.max(
  60_000,
  Number(process.env.ASYNC_JOB_STALE_RUNNING_MS) || LONGEST_KIND_TIMEOUT_MS + 60_000
);
const ORPHAN_MIN_AGE_MS = Math.max(
  30_000,
  Number(process.env.ASYNC_JOB_ORPHAN_MIN_AGE_MS) || 90_000
);
const TIMEOUT_GRACE_MS = Math.max(
  5_000,
  Number(process.env.ASYNC_JOB_TIMEOUT_GRACE_MS) || 20_000
);

const WORKER_FETCH_BUDGET_MS = LONGEST_KIND_TIMEOUT_MS + TIMEOUT_GRACE_MS + 60_000;
const workerFetchAgent = new Agent({
  connect: { timeout: 30_000 },
  connections: 16,
  pipelining: 1,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  headersTimeout: WORKER_FETCH_BUDGET_MS,
  bodyTimeout: WORKER_FETCH_BUDGET_MS,
} as ConstructorParameters<typeof Agent>[0]);

const WORKER_KINDS = resolveWorkerKindsFromEnv();
const REPORT_KINDS = reportKindsAsAsyncJobKinds().filter((k) =>
  WORKER_KINDS.includes(k)
);
const OTHER_KINDS = WORKER_KINDS.filter((k) => !isReportJobKind(k));

const workerId = `${hostname()}:${process.pid}`;
const baseUrl = assertLoopbackAppUrl(
  process.env.ASYNC_JOB_APP_URL ?? "http://127.0.0.1:3000"
);

let stopping = false;
const inFlight = new Set<Promise<void>>();
const reportInFlight = new Set<Promise<void>>();
const otherInFlight = new Set<Promise<void>>();
let memoryDrain: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reconcileAfterTimeout(job: AsyncJobRow): Promise<void> {
  await sleep(TIMEOUT_GRACE_MS);
  const latest = await getAsyncJobById(job.id);
  if (!latest || latest.status === "completed") return;
  if (latest.status === "failed" || latest.status === "needs_regeneration") return;
  if (isReportJobKind(job.kind)) recordReportProviderFailure("timeout");
  await failAsyncJobAndRefundIfCharged(
    job.id,
    "Генерация превысила лимит ожидания worker.",
    "worker_timeout"
  );
}

async function runJobViaHttp(job: AsyncJobRow): Promise<void> {
  const secret = process.env.ASYNC_JOB_WORKER_SECRET;
  if (!secret) throw new Error("ASYNC_JOB_WORKER_SECRET is not configured");
  const { path, body } = endpointForJob(job);
  const kindTimeout = getJobKindConfig(job.kind).timeoutMs;
  const requestTimeoutMs = Math.max(REQUEST_TIMEOUT_MS, kindTimeout + TIMEOUT_GRACE_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const started = Date.now();
  try {
    const response = await undiciFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WORKER_SECRET_HEADER]: secret,
        [WORKER_USER_HEADER]: job.user_id,
        [WORKER_JOB_HEADER]: job.id,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      dispatcher: workerFetchAgent,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const latest = await getAsyncJobById(job.id);
      if (
        latest?.status === "completed" ||
        latest?.status === "failed" ||
        latest?.status === "needs_regeneration"
      ) {
        return;
      }
      if (response.status === 429) {
        recordReportProviderFailure("429");
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 15_000;
        await rescheduleAsyncJob(
          job.id,
          delayMs,
          "Провайдер временно ограничил запросы. Задача вернётся в очередь автоматически."
        );
        return;
      }
      if (response.status >= 500) {
        if (isReportJobKind(job.kind)) recordReportProviderFailure("5xx");
      }
      const message =
        typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
      const codeFromBody =
        typeof data.code === "string"
          ? data.code
          : message === "insufficient_runes" || response.status === 402
            ? "insufficient_runes"
            : "generation_failed";
      if (codeFromBody === "needs_regeneration") {
        await markAsyncJobNeedsRegeneration(job.id, message);
        return;
      }
      await failAsyncJobAndRefundIfCharged(job.id, message, codeFromBody);
      return;
    }
    if (isReportJobKind(job.kind)) recordReportProviderSuccess();
    await finalizeAsyncJobMetrics(job.id, { generationMs: Date.now() - started });
    const latest = await getAsyncJobById(job.id);
    if (latest?.status === "running") {
      await completeAsyncJob(job.id, data);
    }
    await maybeNotifyReportReady(job, data);
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: string }).name === "AbortError");
    if (aborted) {
      await reconcileAfterTimeout(job);
      return;
    }
    const latest = await getAsyncJobById(job.id);
    if (
      latest?.status === "completed" ||
      latest?.status === "failed" ||
      latest?.status === "needs_regeneration"
    ) {
      return;
    }
    if (isReportJobKind(job.kind)) recordReportProviderFailure("other");
    await failAsyncJobAndRefundIfCharged(
      job.id,
      error instanceof Error ? error.message : "async job failed",
      "generation_failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function runJobInProcess(job: AsyncJobRow): Promise<void> {
  const started = Date.now();
  try {
    const outcome = await runReportJobInProcess(job);
    const latest = await getAsyncJobById(job.id);
    if (
      latest?.status === "completed" ||
      latest?.status === "failed" ||
      latest?.status === "needs_regeneration"
    ) {
      return;
    }
    if (outcome.ok) {
      recordReportProviderSuccess();
      await finalizeAsyncJobMetrics(job.id, { generationMs: Date.now() - started });
      if (latest?.status === "running") {
        await completeAsyncJob(job.id, outcome.result);
      }
      await maybeNotifyReportReady(job, outcome.result);
      return;
    }
    if (outcome.needsRegeneration || outcome.code === "needs_regeneration") {
      await markAsyncJobNeedsRegeneration(job.id, outcome.message);
      return;
    }
    if (outcome.code === "rate_limited" || outcome.retryAfterMs) {
      recordReportProviderFailure("429");
      await rescheduleAsyncJob(
        job.id,
        outcome.retryAfterMs ?? 15_000,
        outcome.message
      );
      return;
    }
    if (
      /ETIMEDOUT|fetch failed|ECONNRESET|provider.?unavailable|OpenRouter UNAVAILABLE/i.test(
        outcome.message
      )
    ) {
      recordReportProviderFailure("other");
      void runProviderProbe("job-provider-error");
      await rescheduleAsyncJob(
        job.id,
        outcome.retryAfterMs ?? 30_000,
        "Провайдер временно недоступен, задача вернётся в очередь. Повторного списания не будет."
      );
      return;
    }
    if (/not implemented/i.test(outcome.message)) {
      console.warn(
        `[async-jobs] in-process missing for ${job.kind}; HTTP fallback job=${job.id}`
      );
      await runJobViaHttp(job);
      return;
    }
    recordReportProviderFailure("other");
    await failAsyncJobAndRefundIfCharged(
      job.id,
      outcome.message,
      outcome.code || "generation_failed"
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "async job failed";
    if (/not implemented/i.test(msg)) {
      console.warn(
        `[async-jobs] in-process throw for ${job.kind}; HTTP fallback job=${job.id}`
      );
      await runJobViaHttp(job);
      return;
    }
    const latest = await getAsyncJobById(job.id);
    if (
      latest?.status === "completed" ||
      latest?.status === "failed" ||
      latest?.status === "needs_regeneration"
    ) {
      return;
    }
    if (/ETIMEDOUT|fetch failed|ECONNRESET|provider.?unavailable/i.test(msg)) {
      recordReportProviderFailure("other");
      void runProviderProbe("job-throw-provider-error");
      await rescheduleAsyncJob(
        job.id,
        30_000,
        "Провайдер временно недоступен, задача вернётся в очередь. Повторного списания не будет."
      );
      return;
    }
    recordReportProviderFailure("other");
    await failAsyncJobAndRefundIfCharged(job.id, msg, "generation_failed");
  }
}

async function runJob(job: AsyncJobRow): Promise<void> {
  const useInProcess =
    isReportJobKind(job.kind) && isAsyncReportInProcessEnabled();
  if (useInProcess) {
    await runJobInProcess(job);
  } else {
    await runJobViaHttp(job);
  }
}

function trackLane(
  lane: "report" | "other",
  promise: Promise<void>
): Promise<void> {
  inFlight.add(promise);
  const set = lane === "report" ? reportInFlight : otherInFlight;
  set.add(promise);
  return promise.finally(() => {
    inFlight.delete(promise);
    set.delete(promise);
  });
}

function scheduleMemoryDrain(): void {
  if (stopping || memoryDrain) return;
  memoryDrain = (async () => {
    try {
      const result = await processMemoryExtractionJobs(MEMORY_BATCH_SIZE);
      if (result.processed || result.failed) {
        console.log(
          `[memory-jobs] processed=${result.processed} stored=${result.stored} failed=${result.failed}`
        );
      }
    } catch (error) {
      console.error("[memory-jobs] drain failed:", error);
    }
  })().finally(() => {
    memoryDrain = null;
  });
  void trackLane("other", memoryDrain);
}

async function claimLane(
  lane: "report" | "other",
  kinds: AsyncJobKind[],
  slots: number
): Promise<void> {
  if (slots <= 0 || kinds.length === 0) return;
  if (lane === "report" && lastProviderHealth && !lastProviderHealth.ok) {
    console.warn(
      `[async-jobs] report claim paused — OpenRouter unhealthy: ${lastProviderHealth.error}`
    );
    return;
  }
  if (lane === "report" && isReportClaimPaused()) {
    const cb = getReportCircuitBreakerStats();
    console.warn(
      `[async-jobs] report claim paused by circuit breaker openUntil=${cb.openUntil}`
    );
    return;
  }
  try {
    const jobs = await claimAsyncJobs({
      workerId,
      limit: slots,
      kinds: [...kinds],
    });
    for (const job of jobs) {
      void trackLane(lane, runJob(job));
    }
  } catch (error) {
    console.error(`[async-jobs] ${lane} claim failed:`, error);
  }
}

async function main(): Promise<void> {
  if (!process.env.ASYNC_JOB_WORKER_SECRET) {
    throw new Error("ASYNC_JOB_WORKER_SECRET is required");
  }
  console.log(
    `[async-jobs] worker ${workerId} polling ${baseUrl} inprocess=${isAsyncReportInProcessEnabled()} reportConcurrency=${REPORT_CONCURRENCY} otherConcurrency=${OTHER_CONCURRENCY} proxy=${process.env.OPENROUTER_HTTPS_PROXY || "NONE"} reportKinds=${REPORT_KINDS.join(",")} otherKinds=${OTHER_KINDS.join(",")}`
  );
  await runProviderProbe("startup");
  if (lastProviderHealth && !lastProviderHealth.ok) {
    console.error(
      "[async-jobs] WARNING: starting with OpenRouter unavailable — report lane paused until probe succeeds"
    );
  }
  const memoryTimer = setInterval(scheduleMemoryDrain, MEMORY_POLL_INTERVAL_MS);
  memoryTimer.unref();
  scheduleMemoryDrain();
  const probeTimer = setInterval(() => {
    void runProviderProbe("interval");
  }, PROVIDER_PROBE_MS);
  probeTimer.unref();
  while (!stopping) {
    try {
      const orphans = await reapOrphanedRunningAsyncJobs({
        currentWorkerId: workerId,
        minAgeMs: ORPHAN_MIN_AGE_MS,
        kinds: [...WORKER_KINDS],
      });
      const reaped = await reapStaleRunningAsyncJobs({
        staleAfterMs: STALE_RUNNING_MS,
        kinds: [...WORKER_KINDS],
      });
      if (orphans || reaped.requeued || reaped.failed) {
        console.warn(
          `[async-jobs] reaper orphans=${orphans} requeued=${reaped.requeued} failed=${reaped.failed}`
        );
      }
    } catch (error) {
      console.error("[async-jobs] reaper failed:", error);
    }

    const reportSlots = Math.max(0, REPORT_CONCURRENCY - reportInFlight.size);
    const otherSlots = Math.max(0, OTHER_CONCURRENCY - otherInFlight.size);
    await claimLane("report", REPORT_KINDS, reportSlots);
    await claimLane("other", OTHER_KINDS, otherSlots);

    await sleep(POLL_INTERVAL_MS);
  }

  clearInterval(memoryTimer);
  clearInterval(probeTimer);
  if (inFlight.size) {
    console.log(`[async-jobs] draining ${inFlight.size} in-flight job(s)`);
    await Promise.allSettled([...inFlight]);
  }
  console.log("[async-jobs] stopped cleanly");
}

function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.log(`[async-jobs] received ${signal}; finishing active jobs`);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

void main().catch((error) => {
  console.error("[async-jobs] worker stopped:", error);
  process.exitCode = 1;
});
