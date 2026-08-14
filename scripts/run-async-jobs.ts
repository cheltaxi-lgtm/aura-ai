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
  ASYNC_JOB_WATCHDOG_MS_DEFAULT,
  claimAsyncJobs,
  completeAsyncJob,
  failAsyncJobAndRefundIfCharged,
  finalizeAsyncJobMetrics,
  getAsyncJobById,
  isRetryableReportErrorCode,
  reapNeedsRegenerationAsyncJobs,
  reapOrphanedRunningAsyncJobs,
  reapStaleRunningAsyncJobs,
  reapWatchdogRunningAsyncJobs,
  rescheduleAsyncJob,
  rescheduleOrFailReportJob,
  retryNeedsRegenerationOnce,
  retryOrFailReportJob,
  touchAsyncJobHeartbeat,
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
  isReportJobRetryEnabled,
  reportKindsAsAsyncJobKinds,
} from "../src/lib/async-report-flags";
import {
  enqueueReportReadyDeliveries,
  processDueReportReadyDeliveries,
} from "../src/lib/async-report-notify";
import {
  persistAsyncWorkerHealth,
  probeOpenRouterFromWorker,
  type AsyncWorkerHealth,
} from "../src/lib/async-worker-health";
import { processMemoryExtractionJobs } from "../src/lib/memory/client-memory";
import { processMemoryIntelligenceJobs } from "../src/lib/memory/intelligence-rebuild";

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
  await enqueueReportReadyDeliveries(job, result);
  // Flush immediately; failures stay pending for the periodic tick.
  await processDueReportReadyDeliveries().catch((error) =>
    console.warn("[async-jobs] report delivery flush failed:", error)
  );
}

let lastDeliveryTick = 0;
const DELIVERY_TICK_MS = 5_000;

async function runDeliveryTick(): Promise<void> {
  if (stopping) return;
  const now = Date.now();
  if (now - lastDeliveryTick < DELIVERY_TICK_MS) return;
  lastDeliveryTick = now;
  try {
    const delivered = await processDueReportReadyDeliveries();
    if (delivered) {
      console.log(`[async-jobs] report deliveries sent=${delivered}`);
    }
  } catch (error) {
    console.error("[async-jobs] report delivery tick failed:", error);
  }
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
  5_000,
  Number(process.env.ASYNC_JOB_ORPHAN_MIN_AGE_MS) || 90_000
);
/** Startup orphan sweep — reclaim jobs from the previous PID after deploy/restart. */
const ORPHAN_STARTUP_MIN_AGE_MS = Math.max(
  1_000,
  Number(process.env.ASYNC_JOB_ORPHAN_STARTUP_MIN_AGE_MS) || 5_000
);
const WATCHDOG_MS = Math.max(
  5 * 60_000,
  Number(process.env.ASYNC_JOB_WATCHDOG_MS) || ASYNC_JOB_WATCHDOG_MS_DEFAULT
);
const HEARTBEAT_MS = Math.max(
  15_000,
  Number(process.env.ASYNC_JOB_HEARTBEAT_MS) || 60_000
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
/** Report-lane occupancy by job id — never survives process restart; reconciled vs DB. */
const reportInFlightJobs = new Map<string, Promise<void>>();
const otherInFlight = new Set<Promise<void>>();
let memoryDrain: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drop slot reservations for jobs this worker no longer owns (reaped / completed
 * elsewhere). Prevents a hung LLM promise from blocking concurrency after DB requeue.
 */
async function reconcileReportSlots(): Promise<void> {
  if (reportInFlightJobs.size === 0) return;
  for (const jobId of [...reportInFlightJobs.keys()]) {
    const job = await getAsyncJobById(jobId).catch(() => null);
    if (!job || job.status !== "running" || job.worker_id !== workerId) {
      reportInFlightJobs.delete(jobId);
      console.warn(
        `[async-jobs] freed report slot job=${jobId} dbStatus=${job?.status ?? "missing"} dbWorker=${job?.worker_id ?? "-"}`
      );
    }
  }
}

async function reconcileAfterTimeout(job: AsyncJobRow): Promise<void> {
  await sleep(TIMEOUT_GRACE_MS);
  const latest = await getAsyncJobById(job.id);
  if (!latest || latest.status === "completed") return;
  if (latest.status === "failed" || latest.status === "needs_regeneration") return;
  if (latest.status === "pending") return; // route self-requeued via retry budget
  if (isReportJobKind(job.kind)) recordReportProviderFailure("timeout");
  if (isReportJobKind(job.kind) && isReportJobRetryEnabled()) {
    const outcome = await retryOrFailReportJob({
      jobId: job.id,
      message: "Генерация превысила лимит ожидания worker.",
      errorCode: "worker_timeout",
      delayMs: 30_000,
    });
    if (outcome === "requeued") {
      console.warn(`[async-jobs] worker_timeout retry requeue job=${job.id} kind=${job.kind}`);
    }
    return;
  }
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
        latest?.status === "needs_regeneration" ||
        latest?.status === "pending" // route self-requeued via retry budget
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
        const regen = await retryNeedsRegenerationOnce(job.id, message);
        if (regen === "requeued") {
          console.warn(`[async-jobs] quality regen requeue job=${job.id} kind=${job.kind}`);
        }
        return;
      }
      if (
        isReportJobKind(job.kind) &&
        isReportJobRetryEnabled() &&
        isRetryableReportErrorCode(codeFromBody)
      ) {
        const outcome = await retryOrFailReportJob({
          jobId: job.id,
          message,
          errorCode: codeFromBody,
          delayMs: 30_000,
        });
        if (outcome === "requeued") {
          console.warn(
            `[async-jobs] report retry requeue job=${job.id} kind=${job.kind} code=${codeFromBody}`
          );
        }
        return;
      }
      await failAsyncJobAndRefundIfCharged(job.id, message, codeFromBody);
      return;
    }
    if (isReportJobKind(job.kind)) recordReportProviderSuccess();
    await finalizeAsyncJobMetrics(job.id, { generationMs: Date.now() - started });
    const latest = await getAsyncJobById(job.id);
    if (latest?.status === "running") {
      const completed = await completeAsyncJob(job.id, data);
      if (!completed) {
        const again = await getAsyncJobById(job.id);
        if (again?.status === "running") {
          await failAsyncJobAndRefundIfCharged(
            job.id,
            "Worker could not finalize job after successful generation",
            "complete_rejected"
          );
          return;
        }
      }
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
  const beat = () => {
    void touchAsyncJobHeartbeat(job.id, workerId).catch((err) => {
      console.warn(
        `[async-jobs] heartbeat failed job=${job.id}:`,
        err instanceof Error ? err.message : err
      );
    });
  };
  beat();
  const heartbeat = setInterval(beat, HEARTBEAT_MS);
  try {
    const outcome = await runReportJobInProcess(job);
    const latest = await getAsyncJobById(job.id);
    if (outcome.ok) {
      // Routes self-complete via trackWorkerJobCompleted, so latest is usually
      // already "completed" here — metrics and the guaranteed report-ready
      // notification must still run (both are idempotent).
      recordReportProviderSuccess();
      await finalizeAsyncJobMetrics(job.id, { generationMs: Date.now() - started });
      if (latest?.status === "running" && latest.worker_id === workerId) {
        const completed = await completeAsyncJob(job.id, outcome.result);
        if (!completed) {
          const again = await getAsyncJobById(job.id);
          if (again?.status === "running") {
            console.error(
              `[async-jobs] complete rejected job=${job.id} billing=${again.billing_state} — forcing fail`
            );
            await failAsyncJobAndRefundIfCharged(
              job.id,
              "Worker could not finalize job after successful generation",
              "complete_rejected"
            );
            return;
          }
        }
      }
      const after =
        latest?.status === "running" ? await getAsyncJobById(job.id) : latest;
      if (after?.status === "completed") {
        await maybeNotifyReportReady(job, outcome.result);
      }
      return;
    }
    if (
      latest?.status === "completed" ||
      latest?.status === "failed" ||
      latest?.status === "needs_regeneration" ||
      latest?.status === "pending" ||
      latest?.worker_id !== workerId
    ) {
      return;
    }
    if (outcome.needsRegeneration || outcome.code === "needs_regeneration") {
      const regen = await retryNeedsRegenerationOnce(job.id, outcome.message);
      if (regen === "requeued") {
        console.warn(`[async-jobs] quality regen requeue job=${job.id} kind=${job.kind}`);
      }
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
      const resched = await rescheduleOrFailReportJob({
        jobId: job.id,
        delayMs: outcome.retryAfterMs ?? 30_000,
        message:
          "Провайдер временно недоступен, задача вернётся в очередь. Повторного списания не будет.",
      });
      if (resched === "failed") {
        console.error(
          `[async-jobs] provider reschedule budget exhausted job=${job.id} kind=${job.kind}`
        );
      }
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
    const outcomeCode = outcome.code || "generation_failed";
    if (isReportJobRetryEnabled() && isRetryableReportErrorCode(outcomeCode)) {
      const retry = await retryOrFailReportJob({
        jobId: job.id,
        message: outcome.message,
        errorCode: outcomeCode,
        delayMs: 30_000,
      });
      if (retry === "requeued") {
        console.warn(
          `[async-jobs] report retry requeue job=${job.id} kind=${job.kind} code=${outcomeCode}`
        );
      }
      return;
    }
    await failAsyncJobAndRefundIfCharged(
      job.id,
      outcome.message,
      outcomeCode
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
      const resched = await rescheduleOrFailReportJob({
        jobId: job.id,
        delayMs: 30_000,
        message:
          "Провайдер временно недоступен, задача вернётся в очередь. Повторного списания не будет.",
      });
      if (resched === "failed") {
        console.error(
          `[async-jobs] provider reschedule budget exhausted job=${job.id} kind=${job.kind}`
        );
      }
      return;
    }
    recordReportProviderFailure("other");
    if (isReportJobRetryEnabled()) {
      const retry = await retryOrFailReportJob({
        jobId: job.id,
        message: msg,
        errorCode: "generation_failed",
        delayMs: 30_000,
      });
      if (retry === "requeued") {
        console.warn(
          `[async-jobs] report retry requeue job=${job.id} kind=${job.kind} code=generation_failed`
        );
      }
      return;
    }
    await failAsyncJobAndRefundIfCharged(job.id, msg, "generation_failed");
  } finally {
    clearInterval(heartbeat);
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
  job: AsyncJobRow,
  promise: Promise<void>
): Promise<void> {
  inFlight.add(promise);
  if (lane === "report") {
    reportInFlightJobs.set(job.id, promise);
  } else {
    otherInFlight.add(promise);
  }
  return promise.finally(() => {
    inFlight.delete(promise);
    if (lane === "report") {
      if (reportInFlightJobs.get(job.id) === promise) {
        reportInFlightJobs.delete(job.id);
      }
    } else {
      otherInFlight.delete(promise);
    }
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
      const intel = await processMemoryIntelligenceJobs(MEMORY_BATCH_SIZE);
      if (intel.processed || intel.failed) {
        console.log(
          `[memory-intelligence] processed=${intel.processed} failed=${intel.failed} rebuild_ms=${intel.rebuildMs}`
        );
      }
    } catch (error) {
      console.error("[memory-jobs] drain failed:", error);
    }
  })().finally(() => {
    memoryDrain = null;
  });
  void trackLane(
    "other",
    { id: "memory-drain" } as AsyncJobRow,
    memoryDrain
  );
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
      console.log(
        `[async-jobs] claim lane=${lane} kind=${job.kind} job=${job.id} attempt=${job.attempt_count}`
      );
      void trackLane(
        lane,
        job,
        runJob(job).finally(() => {
          console.log(`[async-jobs] finish lane=${lane} kind=${job.kind} job=${job.id}`);
        })
      );
    }
  } catch (error) {
    console.error(`[async-jobs] ${lane} claim failed:`, error);
  }
}

async function main(): Promise<void> {
  if (!process.env.ASYNC_JOB_WORKER_SECRET) {
    throw new Error("ASYNC_JOB_WORKER_SECRET is required");
  }
  // reportInFlightJobs is process-local — always empty on start.
  console.log(
    `[async-jobs] worker ${workerId} polling ${baseUrl} inprocess=${isAsyncReportInProcessEnabled()} reportConcurrency=${REPORT_CONCURRENCY} otherConcurrency=${OTHER_CONCURRENCY} proxy=${process.env.OPENROUTER_HTTPS_PROXY || "NONE"} reportSlots=0/${REPORT_CONCURRENCY} watchdogMs=${WATCHDOG_MS} reportKinds=${REPORT_KINDS.join(",")} otherKinds=${OTHER_KINDS.join(",")}`
  );
  try {
    const startupOrphans = await reapOrphanedRunningAsyncJobs({
      currentWorkerId: workerId,
      minAgeMs: ORPHAN_STARTUP_MIN_AGE_MS,
      kinds: [...WORKER_KINDS],
    });
    if (startupOrphans) {
      console.warn(
        `[async-jobs] startup orphan reclaim count=${startupOrphans}`
      );
    }
  } catch (error) {
    console.error("[async-jobs] startup orphan reclaim failed:", error);
  }
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
      await reconcileReportSlots();
      const orphans = await reapOrphanedRunningAsyncJobs({
        currentWorkerId: workerId,
        minAgeMs: ORPHAN_MIN_AGE_MS,
        kinds: [...WORKER_KINDS],
      });
      const reaped = await reapStaleRunningAsyncJobs({
        staleAfterMs: STALE_RUNNING_MS,
        kinds: [...WORKER_KINDS],
        currentWorkerId: workerId,
      });
      const watchdog = await reapWatchdogRunningAsyncJobs({
        maxRunningMs: WATCHDOG_MS,
        kinds: [...WORKER_KINDS],
      });
      const regen = await reapNeedsRegenerationAsyncJobs({
        minAgeMs: 60_000,
        kinds: [...WORKER_KINDS],
      });
      if (
        orphans ||
        reaped.requeued ||
        reaped.failed ||
        watchdog.requeued ||
        watchdog.failed ||
        regen.requeued ||
        regen.failed
      ) {
        console.warn(
          `[async-jobs] reaper orphans=${orphans} staleRequeued=${reaped.requeued} staleFailed=${reaped.failed} watchdogRequeued=${watchdog.requeued} watchdogFailed=${watchdog.failed} regenRequeued=${regen.requeued} regenFailed=${regen.failed} reportSlots=${reportInFlightJobs.size}/${REPORT_CONCURRENCY}`
        );
        await reconcileReportSlots();
      }
    } catch (error) {
      console.error("[async-jobs] reaper failed:", error);
    }

    await runDeliveryTick();

    const reportSlots = Math.max(
      0,
      REPORT_CONCURRENCY - reportInFlightJobs.size
    );
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
