import { NextResponse } from "next/server";

import {
  getAsyncJobQueuePosition,
  listReportJobsForUser,
  type AsyncJobRow,
} from "@/lib/async-jobs";
import { getJobKindConfig } from "@/lib/async-job-registry";
import { reportKindsAsAsyncJobKinds } from "@/lib/async-report-flags";
import { resolveAsyncReportDestination } from "@/lib/async-report-destination";
import { ensureDb, query } from "@/lib/db";
import { profileAuthFailureResponse, resolveProfileUserContext } from "@/lib/require-auth";

type DeliveryStatus = "pending" | "delivered" | "failed" | "skipped";

/**
 * User-facing heavy report feed: active jobs plus recently terminal ones,
 * with destination, live progress and per-channel notification delivery.
 * Never includes the report result body — destinations carry the content.
 */
export async function GET() {
  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const jobs = await listReportJobsForUser(
    resolved.profileUserId,
    reportKindsAsAsyncJobKinds()
  );

  const deliveryByJob = new Map<string, Record<string, DeliveryStatus>>();
  if (jobs.length) {
    const { rows } = await query<{
      job_id: string;
      channel: string;
      status: DeliveryStatus;
    }>(
      `SELECT job_id, channel, status
       FROM async_job_notification_deliveries
       WHERE job_id = ANY($1::uuid[])`,
      [jobs.map((j) => j.id)]
    );
    for (const row of rows) {
      const entry = deliveryByJob.get(row.job_id) ?? {};
      entry[row.channel] = row.status;
      deliveryByJob.set(row.job_id, entry);
    }
  }

  const reports = await Promise.all(
    jobs.map(async (job: AsyncJobRow) => {
      const config = getJobKindConfig(job.kind);
      const destination = resolveAsyncReportDestination({
        kind: job.kind,
        jobInput: job.input,
        result: job.status === "completed" ? job.result : null,
      });
      const progress =
        job.progress && typeof job.progress === "object" && Object.keys(job.progress).length
          ? job.progress
          : undefined;
      return {
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        productTitle: config.productTitle ?? "Отчёт",
        waitPolicy: config.waitPolicy ?? "blocking",
        etaRangeSec: config.etaRangeSec ?? null,
        destination,
        createdAt: job.created_at.toISOString(),
        startedAt: job.started_at?.toISOString() ?? null,
        completedAt: job.completed_at?.toISOString() ?? null,
        heartbeatAt: (job.locked_at ?? job.updated_at).toISOString(),
        attempts: job.attempt_count,
        nextAttemptAt: job.next_attempt_at?.toISOString() ?? null,
        billingState: job.billing_state,
        refunded: job.billing_state === "refunded",
        queuePosition:
          job.status === "pending" ? await getAsyncJobQueuePosition(job.id) : null,
        progress: progress
          ? {
              done: typeof progress.done === "number" ? progress.done : undefined,
              total: typeof progress.total === "number" ? progress.total : undefined,
              label: typeof progress.label === "string" ? progress.label : undefined,
              stage: typeof progress.stage === "string" ? progress.stage : undefined,
              message: typeof progress.message === "string" ? progress.message : undefined,
            }
          : undefined,
        notification: deliveryByJob.get(job.id) ?? null,
      };
    })
  );

  return NextResponse.json({ reports });
}
