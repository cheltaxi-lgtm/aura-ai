import type { NextRequest } from "next/server";

import {
  completeAsyncJob,
  failAsyncJob,
  markAsyncJobCharged,
  markAsyncJobRefunded,
} from "@/lib/async-jobs";
import { getAsyncJobIdFromRequest } from "@/lib/async-job-worker-auth";

/** After a successful charge on a worker-driven natal route. */
export async function trackWorkerJobCharged(
  request: NextRequest,
  transactionId: string | null | undefined
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId || !transactionId) return;
  await markAsyncJobCharged(jobId, transactionId);
}

/** After rollbackCharge on a worker-driven natal route. */
export async function trackWorkerJobRefunded(request: NextRequest): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  await markAsyncJobRefunded(jobId);
}

/** Route is source of truth: mark job completed when the handler succeeds. */
export async function trackWorkerJobCompleted(
  request: NextRequest,
  result: Record<string, unknown>
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  await completeAsyncJob(jobId, result);
}

/** Route failed after charge/refund handling; keep job terminal for the poller. */
export async function trackWorkerJobFailed(
  request: NextRequest,
  message: string,
  options?: { refunded?: boolean; errorCode?: string }
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  if (options?.refunded) {
    await markAsyncJobRefunded(jobId);
  }
  await failAsyncJob(jobId, message, options?.errorCode ?? "generation_failed");
}
