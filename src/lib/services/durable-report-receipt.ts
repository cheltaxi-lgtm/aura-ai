import { queryClient, withTransaction, type PoolClient } from "@/lib/db";
import type { AsyncJobAttempt, AsyncJobRow } from "@/lib/async-jobs";
import { recordJourneyEvent } from "@/lib/spread-metrics-store";

export type ReportWorkerJob = { jobId: string; attempt: AsyncJobAttempt };

export async function recoverSavedWorkerReport(userId: string, worker?: ReportWorkerJob): Promise<Record<string, unknown> | null> {
  if (!worker) return null;
  return withTransaction(async client => {
    if (!(await lockReportWorkerSave(client, userId, worker))) return null;
    const job = (await queryClient<AsyncJobRow>(client, "SELECT * FROM async_jobs WHERE id=$1", [worker.jobId])).rows[0];
    if (!job.charge_transaction_id || job.billing_state !== "charged") return null;
    await lockPaidReportReceipt(client, job.charge_transaction_id);
    const result = await durableReportResult(client, userId, job.charge_transaction_id);
    if (result) await completeReportWorkerSave(client, userId, worker, result);
    return result;
  });
}

export async function lockReportWorkerSave(client: PoolClient, userId: string, worker?: ReportWorkerJob, transactionId?: string): Promise<boolean> {
  if (!worker) return true;
  const job = (await queryClient<AsyncJobRow>(client, "SELECT * FROM async_jobs WHERE id=$1 FOR UPDATE", [worker.jobId])).rows[0];
  return Boolean(job && job.user_id === userId && job.status === "running" &&
    job.worker_id === worker.attempt.workerId && job.attempt_count === worker.attempt.attemptCount &&
    ["unbilled", "charged"].includes(job.billing_state) && (!transactionId || job.charge_transaction_id === transactionId));
}

/** Receipt and successful delivery commit together, before another request can delete it. */
export async function completeReportWorkerSave(client: PoolClient, userId: string, worker: ReportWorkerJob | undefined,
  result: Record<string, unknown>): Promise<void> {
  if (!worker) return;
  const done = await queryClient<{ kind: string }>(client, `UPDATE async_jobs SET status='completed',billing_state='completed',
    result=$2::jsonb,error_message=NULL,error_code=NULL,completed_at=NOW(),updated_at=NOW(),worker_id=NULL,locked_at=NULL
    WHERE id=$1 AND user_id=$3 AND status='running' AND worker_id=$4 AND attempt_count=$5 RETURNING kind`,
    [worker.jobId,JSON.stringify(result),userId,worker.attempt.workerId,worker.attempt.attemptCount]);
  if (done.rowCount !== 1) throw new Error("stale_async_job_attempt");
  await recordJourneyEvent(userId, "first_result", "first", { product: done.rows[0].kind }, client);
}

/** Lock delivery rows before profile/report locks to preserve the common lock order. */
export async function lockReportDeletionJobs(client: PoolClient, userId: string, reportId: string, kind: "natal" | "compatibility"): Promise<void> {
  const source = kind === "natal" ? "natal_report_history" : "natal_compatibility_reports";
  const owner = kind === "natal" ? "user_id" : "owner_user_id";
  await queryClient(client, `SELECT id FROM async_jobs WHERE user_id=$1 AND
    (result->>'reportId'=$2::text OR charge_transaction_id IN (SELECT charge_transaction_id FROM ${source} WHERE id=$2::uuid AND ${owner}=$1))
    ORDER BY id FOR UPDATE`, [userId,reportId]);
}

export async function clearDeletedReportDelivery(client: PoolClient, userId: string, reportId: string, kind: "natal" | "compatibility"): Promise<void> {
  const source = kind === "natal" ? "natal_report_history" : "natal_compatibility_reports";
  const owner = kind === "natal" ? "user_id" : "owner_user_id";
  await queryClient(client, `UPDATE async_jobs SET status='completed',billing_state=CASE WHEN billing_state='refunded' THEN 'refunded' ELSE 'completed' END,result=$3::jsonb,
    worker_id=NULL,locked_at=NULL,error_message=NULL,error_code=NULL,completed_at=COALESCE(completed_at,NOW()),updated_at=NOW()
    WHERE user_id=$1 AND (result->>'reportId'=$2::text OR charge_transaction_id IN
      (SELECT charge_transaction_id FROM ${source} WHERE id=$2::uuid AND ${owner}=$1))`, [userId,reportId,JSON.stringify({reportId,deleted:true})]);
}

/** Serialize the decision with a save that may not have committed yet. */
export async function lockPaidReportReceipt(client: PoolClient, transactionId?: string | null): Promise<void> {
  if (transactionId) await queryClient(client, "SELECT pg_advisory_xact_lock(hashtextextended('paid-report:' || $1::text, 0))", [transactionId]);
}

export async function paidReportCanSave(client: PoolClient, transactionId?: string | null): Promise<boolean> {
  await lockPaidReportReceipt(client, transactionId);
  if (!transactionId) return true;
  const refunded = await queryClient(client, "SELECT id FROM rune_transactions WHERE refund_of_transaction_id=$1 LIMIT 1", [transactionId]);
  return !refunded.rows.length;
}

/** A saved receipt is the authority even if the worker crashed before delivery. */
export async function durableReportResult(client: PoolClient, userId: string, transactionId: string): Promise<Record<string, unknown> | null> {
  const natal = await queryClient<{ id: string; content: string; structured_data: unknown; evidence_refs: unknown; tradition: string; report_type: string }>(client,
    "SELECT id, content, structured_data, evidence_refs, tradition, report_type FROM natal_report_history WHERE user_id=$1 AND charge_transaction_id=$2 LIMIT 1", [userId, transactionId]);
  const report = natal.rows[0];
  if (report) {
    const forecast = report.report_type.startsWith("forecast:");
    return { [forecast ? "forecast" : "interpretation"]: report.content, report: report.structured_data,
      evidence: report.evidence_refs, reportId: report.id, tradition: report.tradition,
      ...(forecast ? { horizon: Number(report.report_type.split(":")[1]) } : {}) };
  }
  const compatibility = await queryClient<{ id: string }>(client,
    "SELECT id FROM natal_compatibility_reports WHERE owner_user_id=$1 AND charge_transaction_id=$2 AND status='completed' AND report_data IS NOT NULL LIMIT 1", [userId, transactionId]);
  if (compatibility.rows[0]) {
    const { getCompatibilityRecord } = await import("@/lib/services/natal-compatibility-service");
    const record = await getCompatibilityRecord(compatibility.rows[0].id, userId, client);
    if (!record) throw new Error("compatibility_delivery_recovery_missing");
    return { record, reportId: record.id };
  }
  const matrix = await queryClient<{ id: string }>(client,
    "SELECT id FROM numerology_report_history WHERE user_id=$1 AND charge_transaction_id=$2 LIMIT 1", [userId, transactionId]);
  if (!matrix.rows[0]) return null;
  const { getUserMatrixReportById } = await import("@/lib/services/numerology-report-service");
  const { matrixReportDisplayMetadata } = await import("@/lib/numerology/matrix-report-display");
  const saved = await getUserMatrixReportById(userId, matrix.rows[0].id, client);
  if (!saved) throw new Error("matrix_delivery_recovery_missing");
  return { ...matrixReportDisplayMetadata(saved), reading: saved.content, reportId: saved.id,
    isPaid: true, matrixOwned: true, matrixSubjectId: saved.subjectId, createdAt: saved.createdAt };
}
