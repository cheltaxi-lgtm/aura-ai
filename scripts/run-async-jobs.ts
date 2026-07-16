import { hostname } from "node:os";

import {
  claimAsyncJobs,
  completeAsyncJob,
  failAsyncJob,
  type AsyncJobRow,
} from "../src/lib/async-jobs";

const POLL_INTERVAL_MS = Math.max(250, Number(process.env.ASYNC_JOB_POLL_MS) || 1_000);
const CONCURRENCY = Math.min(10, Math.max(1, Number(process.env.ASYNC_JOB_CONCURRENCY) || 2));
const REQUEST_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.ASYNC_JOB_REQUEST_TIMEOUT_MS) || 360_000
);
const workerId = `${hostname()}:${process.pid}`;
const baseUrl = (
  process.env.ASYNC_JOB_APP_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://127.0.0.1:3000"
).replace(/\/+$/, "");

let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endpointFor(job: AsyncJobRow): { path: string; body: Record<string, unknown> } {
  if (job.kind === "natal_interpretation") {
    return { path: "/api/natal-chart/interpretation", body: { ...job.input, async: false } };
  }
  if (job.kind === "natal_forecast") {
    return { path: "/api/natal-chart/forecast", body: { ...job.input, async: false } };
  }
  if (job.kind === "natal_compatibility") {
    const id = job.input.id;
    if (typeof id !== "string") throw new Error("invalid compatibility job payload");
    const { id: _id, ...body } = job.input;
    return {
      path: `/api/natal-chart/compatibility/${encodeURIComponent(id)}/generate`,
      body: { ...body, async: false },
    };
  }
  throw new Error(`unsupported async job kind: ${job.kind}`);
}

async function runJob(job: AsyncJobRow): Promise<void> {
  const secret = process.env.ASYNC_JOB_WORKER_SECRET;
  if (!secret) throw new Error("ASYNC_JOB_WORKER_SECRET is not configured");
  const { path, body } = endpointFor(job);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-async-job-worker-secret": secret,
        "x-async-job-user-id": job.user_id,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        typeof data.error === "string" ? data.error : `HTTP ${response.status}`
      );
    }
    await completeAsyncJob(job.id, data);
  } catch (error) {
    await failAsyncJob(job.id, error instanceof Error ? error.message : "natal job failed");
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  if (!process.env.ASYNC_JOB_WORKER_SECRET) {
    throw new Error("ASYNC_JOB_WORKER_SECRET is required");
  }
  console.log(`[async-jobs] worker ${workerId} polling ${baseUrl}`);
  while (!stopping) {
    const jobs = await claimAsyncJobs({
      workerId,
      limit: CONCURRENCY,
      kinds: ["natal_interpretation", "natal_forecast", "natal_compatibility"],
    });
    if (!jobs.length) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    await Promise.all(jobs.map(runJob));
  }
}

function stop(signal: string): void {
  stopping = true;
  console.log(`[async-jobs] received ${signal}; finishing active jobs`);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

void main().catch((error) => {
  console.error("[async-jobs] worker stopped:", error);
  process.exitCode = 1;
});
