import { hostname } from "node:os";

import {
  assertLoopbackAppUrl,
  WORKER_JOB_HEADER,
  WORKER_SECRET_HEADER,
  WORKER_USER_HEADER,
} from "../src/lib/async-job-worker-auth-shared";
import {
  endpointForJob,
  getJobKindConfig,
  resolveWorkerKindsFromEnv,
} from "../src/lib/async-job-registry";
import {
  claimAsyncJobs,
  completeAsyncJob,
  failAsyncJobAndRefundIfCharged,
  getAsyncJobById,
  reapOrphanedRunningAsyncJobs,
  reapStaleRunningAsyncJobs,
  type AsyncJobRow,
} from "../src/lib/async-jobs";
import { processMemoryExtractionJobs } from "../src/lib/memory/client-memory";

const POLL_INTERVAL_MS = Math.max(250, Number(process.env.ASYNC_JOB_POLL_MS) || 1_000);
const MEMORY_POLL_INTERVAL_MS = Math.max(
  1_000,
  Number(process.env.MEMORY_JOB_POLL_MS) || 3_000
);
const MEMORY_BATCH_SIZE = Math.min(
  10,
  Math.max(1, Number(process.env.MEMORY_JOB_BATCH_SIZE) || 3)
);
/** Default 4 — matrix/tarot jobs were queuing behind each other at 2. */
const CONCURRENCY = Math.min(10, Math.max(1, Number(process.env.ASYNC_JOB_CONCURRENCY) || 4));
/**
 * Default HTTP abort for short jobs. Long kinds (numerology_reading) use kind.timeoutMs.
 * After abort we still wait TIMEOUT_GRACE before refund so a late save_claimed can win.
 */
const REQUEST_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.ASYNC_JOB_REQUEST_TIMEOUT_MS) || 280_000
);
/**
 * Requeue zombies after deploy SIGKILL. Must exceed longest kind timeout
 * (numerology_reading 420s) or live matrix jobs get reaped mid-run.
 */
const STALE_RUNNING_MS = Math.max(
  60_000,
  Number(process.env.ASYNC_JOB_STALE_RUNNING_MS) || 9 * 60_000
);
const ORPHAN_MIN_AGE_MS = Math.max(
  30_000,
  Number(process.env.ASYNC_JOB_ORPHAN_MIN_AGE_MS) || 90_000
);

const TIMEOUT_GRACE_MS = Math.max(
  5_000,
  Number(process.env.ASYNC_JOB_TIMEOUT_GRACE_MS) || 20_000
);

const WORKER_KINDS = resolveWorkerKindsFromEnv();

const workerId = `${hostname()}:${process.pid}`;
// Never fall back to NEXT_PUBLIC_APP_URL (public origin) — worker must stay on loopback.
const baseUrl = assertLoopbackAppUrl(
  process.env.ASYNC_JOB_APP_URL ?? "http://127.0.0.1:3000"
);

let stopping = false;
const inFlight = new Set<Promise<void>>();
let memoryDrain: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reconcileAfterTimeout(job: AsyncJobRow): Promise<void> {
  await sleep(TIMEOUT_GRACE_MS);
  const latest = await getAsyncJobById(job.id);
  if (!latest || latest.status === "completed") return;
  if (latest.status === "failed") return;
  await failAsyncJobAndRefundIfCharged(
    job.id,
    "Генерация превысила лимит ожидания worker.",
    "worker_timeout"
  );
}

async function runJob(job: AsyncJobRow): Promise<void> {
  const secret = process.env.ASYNC_JOB_WORKER_SECRET;
  if (!secret) throw new Error("ASYNC_JOB_WORKER_SECRET is not configured");
  const { path, body } = endpointForJob(job);
  const kindTimeout = getJobKindConfig(job.kind).timeoutMs;
  const requestTimeoutMs = Math.max(REQUEST_TIMEOUT_MS, kindTimeout + TIMEOUT_GRACE_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WORKER_SECRET_HEADER]: secret,
        [WORKER_USER_HEADER]: job.user_id,
        [WORKER_JOB_HEADER]: job.id,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const latest = await getAsyncJobById(job.id);
      if (latest?.status === "completed" || latest?.status === "failed") return;
      const message =
        typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
      await failAsyncJobAndRefundIfCharged(
        job.id,
        message,
        typeof data.code === "string" ? data.code : "generation_failed"
      );
      return;
    }
    // Route is source of truth via trackWorkerJobCompleted; only complete if still running.
    const latest = await getAsyncJobById(job.id);
    if (latest?.status === "running") {
      await completeAsyncJob(job.id, data);
    }
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
    if (latest?.status === "completed" || latest?.status === "failed") return;
    await failAsyncJobAndRefundIfCharged(
      job.id,
      error instanceof Error ? error.message : "async job failed",
      "generation_failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

function track(promise: Promise<void>): Promise<void> {
  inFlight.add(promise);
  return promise.finally(() => {
    inFlight.delete(promise);
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
  void track(memoryDrain);
}

async function main(): Promise<void> {
  if (!process.env.ASYNC_JOB_WORKER_SECRET) {
    throw new Error("ASYNC_JOB_WORKER_SECRET is required");
  }
  console.log(
    `[async-jobs] worker ${workerId} polling ${baseUrl} kinds=${WORKER_KINDS.join(",")}`
  );
  const memoryTimer = setInterval(scheduleMemoryDrain, MEMORY_POLL_INTERVAL_MS);
  memoryTimer.unref();
  scheduleMemoryDrain();
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

    const jobs = await claimAsyncJobs({
      workerId,
      limit: CONCURRENCY,
      kinds: [...WORKER_KINDS],
    });
    if (!jobs.length) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    await Promise.all(jobs.map((job) => track(runJob(job))));
  }

  clearInterval(memoryTimer);
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
