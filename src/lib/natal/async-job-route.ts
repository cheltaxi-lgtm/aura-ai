import { NextResponse } from "next/server";

import {
  countActiveAsyncJobsForUser,
  createAsyncJob,
  findActiveAsyncJob,
  type AsyncJobKind,
} from "@/lib/async-jobs";
import { isAsyncJobWorkerConfigured } from "@/lib/async-job-worker-auth";
import { ensureDb } from "@/lib/db";

const NATAL_KINDS: AsyncJobKind[] = [
  "natal_interpretation",
  "natal_forecast",
  "natal_compatibility",
];
const MAX_ACTIVE_NATAL_JOBS_PER_USER = 3;

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
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
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

  const activeCount = await countActiveAsyncJobsForUser({
    userId: input.userId,
    kinds: NATAL_KINDS,
  });
  if (activeCount >= MAX_ACTIVE_NATAL_JOBS_PER_USER) {
    return NextResponse.json(
      {
        error: "Слишком много незавершённых генераций. Дождитесь завершения текущих.",
        code: "async_job_limit",
      },
      { status: 429 }
    );
  }

  const jobId = await createAsyncJob(input);
  return NextResponse.json(
    { jobId, status: "pending", pollUrl: `/api/jobs/${jobId}` },
    { status: 202 }
  );
}
