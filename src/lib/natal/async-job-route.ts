import { NextResponse } from "next/server";

import {
  createAsyncJob,
  findActiveAsyncJob,
  type AsyncJobKind,
} from "@/lib/async-jobs";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { ensureDb } from "@/lib/db";

export async function enqueueNatalAsyncJob(input: {
  userId: string;
  kind: Extract<
    AsyncJobKind,
    "natal_interpretation" | "natal_forecast" | "natal_compatibility"
  >;
  payload: Record<string, unknown>;
}): Promise<NextResponse> {
  if (!isAsyncJobWorkerConfigured()) {
    return NextResponse.json(
      { error: "Async natal worker is not configured" },
      { status: 503 }
    );
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const existingId = await findActiveAsyncJob(input);
  if (existingId) {
    return NextResponse.json(
      {
        jobId: existingId,
        status: "pending",
        pollUrl: `/api/jobs/${existingId}`,
        deduped: true,
      },
      { status: 202 }
    );
  }

  const jobId = await createAsyncJob(input);
  return NextResponse.json(
    { jobId, status: "pending", pollUrl: `/api/jobs/${jobId}` },
    { status: 202 }
  );
}
