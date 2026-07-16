import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

const WORKER_SECRET_HEADER = "x-async-job-worker-secret";
const WORKER_USER_HEADER = "x-async-job-user-id";

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
  const expectedSecret = process.env.ASYNC_JOB_WORKER_SECRET;
  const providedSecret = request.headers.get(WORKER_SECRET_HEADER);
  const userId = request.headers.get(WORKER_USER_HEADER);
  if (!expectedSecret || !providedSecret || !userId || !secretsMatch(providedSecret, expectedSecret)) {
    return null;
  }
  return userId;
}

export function isAsyncJobWorkerConfigured(): boolean {
  return Boolean(process.env.ASYNC_JOB_WORKER_SECRET);
}
