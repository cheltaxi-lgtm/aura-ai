import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getAsyncJobIdFromRequest, getAsyncJobWorkerUserId } from "@/lib/async-job-worker-auth";
import { captureMemoryGeneration } from "@/lib/memory/write-guard";

/** Worker retries use consent accepted with the durable job, never today's consent. */
export async function captureMemoryGenerationForRequest(request: NextRequest, userId: string): Promise<string | null> {
  if (!getAsyncJobWorkerUserId(request)) return captureMemoryGeneration(userId);
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return null;
  try {
    const { rows } = await query(`SELECT provenance->>'memoryCaptureGeneration' AS generation
      FROM async_jobs WHERE id=$1 AND user_id=$2`, [jobId, userId]);
    return rows[0]?.generation ?? null;
  } catch { return null; }
}
