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
/** Longest registered kind timeout (hd_report / pro_premium_report = 800s). */
const LONGEST_KIND_TIMEOUT_MS = Math.max(
  ...Object.values(ASYNC_JOB_REGISTRY).map((k) => k.timeoutMs)
);
/**
 * Requeue zombies after deploy SIGKILL. Must exceed longest kind timeout
 * (+1 min buffer) or live HD/matrix jobs get reaped mid-run.
 */
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

/**
 * Sectional HD / Pro premium hold the HTTP connection until generation finishes
 * (no early headers). Undici's default headersTimeout (~300s) aborts as
 * TypeError "fetch failed" while Next is still working — every Pro HD case
 * after the sectional pipeline failed at ~5 min with that message.
 */
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
      if (latest?.status === "completed" || latest?.status === "failed") return;
      const message =
        typeof data.error === "string" ? data.error : `HTTP ${response.status}`;
      const codeFromBody =
        typeof data.code === "string"
          ? data.code
          : message === "insufficient_runes" || response.status === 402
            ? "insufficient_runes"
            : "generation_failed";
      await failAsyncJobAndRefundIfCharged(job.id, message, codeFromBody);
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

    // Keep claiming while slots are free. Awaiting Promise.all(here) used to
    // stall the whole poll loop behind one long HD/pro job (~10 min), so
    // photo_reading / intention / daily sat in pending and the UI spun forever.
    const slots = Math.max(0, CONCURRENCY - inFlight.size);
    if (slots > 0) {
      try {
        const jobs = await claimAsyncJobs({
          workerId,
          limit: slots,
          kinds: [...WORKER_KINDS],
        });
        for (const job of jobs) {
          void track(runJob(job));
        }
      } catch (error) {
        console.error("[async-jobs] claim failed:", error);
      }
    }
    await sleep(POLL_INTERVAL_MS);
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
