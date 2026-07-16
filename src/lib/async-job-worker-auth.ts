import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import {
  isDirectLoopbackWorkerCall,
  isWorkerUserId,
  WORKER_JOB_HEADER,
  WORKER_SECRET_HEADER,
  WORKER_USER_HEADER,
} from "@/lib/async-job-worker-auth-shared";

export {
  assertLoopbackAppUrl,
  isAuthenticatedNatalWorkerRequest,
  isDirectLoopbackWorkerCall,
  isNatalWorkerEndpoint,
  isWorkerUserId,
  secretsMatchEdge,
  WORKER_JOB_HEADER,
  WORKER_SECRET_HEADER,
  WORKER_USER_HEADER,
} from "@/lib/async-job-worker-auth-shared";

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

/**
 * Returns the profile owner only for an authenticated local job-worker call.
 * Regular browser requests must continue through requireProfileUserId().
 */
export function getAsyncJobWorkerUserId(request: NextRequest): string | null {
  if (!isDirectLoopbackWorkerCall(request)) return null;
  const expectedSecret = process.env.ASYNC_JOB_WORKER_SECRET;
  const providedSecret = request.headers.get(WORKER_SECRET_HEADER);
  const userId = request.headers.get(WORKER_USER_HEADER);
  if (
    !expectedSecret ||
    !providedSecret ||
    !isWorkerUserId(userId) ||
    !secretsMatch(providedSecret, expectedSecret)
  ) {
    return null;
  }
  return userId;
}

/**
 * Job id is only trusted on authenticated loopback worker calls.
 * Browser JWT requests must not drive billing reuse / job finalization via this header.
 */
export function getAsyncJobIdFromRequest(request: NextRequest): string | null {
  if (!getAsyncJobWorkerUserId(request)) return null;
  const jobId = request.headers.get(WORKER_JOB_HEADER);
  return isWorkerUserId(jobId) ? jobId : null;
}

export function isAsyncJobWorkerConfigured(): boolean {
  return Boolean(process.env.ASYNC_JOB_WORKER_SECRET);
}
