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
    input=CASE WHEN kind='pro_premium_report' THEN input-'frozenPayload'-'frozenQuestion'-'frozenAlias'-'frozenPractitionerContext'-'refinement' ELSE input END,
    result=$2::jsonb,error_message=NULL,error_code=NULL,completed_at=NOW(),updated_at=NOW(),worker_id=NULL,locked_at=NULL
    WHERE id=$1 AND user_id=$3 AND status='running' AND worker_id=$4 AND attempt_count=$5 RETURNING kind`,
    [worker.jobId,JSON.stringify(result),userId,worker.attempt.workerId,worker.attempt.attemptCount]);
  if (done.rowCount !== 1) throw new Error("stale_async_job_attempt");
  if (done.rows[0].kind !== "image_generate") await recordJourneyEvent(userId, "first_result", "first", { product: done.rows[0].kind }, client);
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
  const spend = (await queryClient<{action_type:string|null}>(client,"SELECT action_type FROM rune_transactions WHERE id=$1 AND user_id=$2",[transactionId,userId])).rows[0];
  if(spend?.action_type?.startsWith("pro_")) {
    const { getProHdReceipt } = await import("@/modules/pro/db/hd-generation");
    const receipt=await getProHdReceipt(userId,{transactionId});
    if(receipt)return receipt;
  }
  if (spend?.action_type === "JOINT_READING") {
    const receipt = (await queryClient<{token:string}>(client,
      "SELECT token FROM joint_readings WHERE id=$1 AND initiator_user_id=$2 AND rune_charged=TRUE",[transactionId,userId])).rows[0];
    if (receipt) {
      const { getJointReadingByToken,buildJointReadingUrl } = await import("@/lib/joint-reading-service");
      const invite = await getJointReadingByToken(receipt.token,client);
      if (invite) return { token:invite.token,url:buildJointReadingUrl(invite.token),intentSlug:invite.intent_slug,
        spreadId:invite.spread_id,expiresAt:invite.expires_at,reused:true,configUpdated:false };
    }
  }
  if (spend?.action_type === "ritual") {
    const receipt = (await queryClient<{id:string}>(client,"SELECT id FROM rituals WHERE user_id=$1 AND transaction_id=$2 AND status IN ('completed','reviewed')",[userId,transactionId])).rows[0];
    if (receipt) {
      const {getRitualById,ritualToClient} = await import("@/lib/ritual-service");
      const ritual = await getRitualById(receipt.id,client);
      if (ritual) return {ok:true,status:"completed",ritual:ritualToClient(ritual)};
    }
  }
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
  const hd = await queryClient<{id:string}>(client,`SELECT id FROM hd_reports WHERE user_id=$1 AND transaction_id::text=$2
    AND (status='done' OR (status='pending' AND admin_rewrite_started_at IS NOT NULL)) AND length(trim(report_text))>0 LIMIT 1`,[userId,transactionId]);
  if (hd.rows[0]) {
    const { getHdReportById, toPublicHdReport } = await import("./human-design-service");
    const record = await getHdReportById(hd.rows[0].id,userId,client);
    if (!record) throw new Error("hd_delivery_recovery_missing");
    return { report:toPublicHdReport(record),reportId:record.id };
  }
  const composite = await queryClient<{id:string}>(client,`SELECT id FROM hd_composite_reports WHERE user_id=$1 AND transaction_id::text=$2
    AND status IN ('done','pending') AND length(trim(report_text))>0 LIMIT 1`,[userId,transactionId]);
  if (composite.rows[0]) {
    const { getHdCompositeReportById, toPublicHdCompositeReport } = await import("./human-design-service");
    const record = await getHdCompositeReportById(composite.rows[0].id,userId,client);
    if (!record) throw new Error("hd_composite_delivery_recovery_missing");
    return { report:toPublicHdCompositeReport(record),reportId:record.id };
  }
  const matrix = await queryClient<{ id: string }>(client,
    "SELECT id FROM numerology_report_history WHERE user_id=$1 AND charge_transaction_id=$2 LIMIT 1", [userId, transactionId]);
  if (!matrix.rows[0]) {
    // Ordinary readings and scene art are durable products too. Only an owned
    // server-written artifact with this exact spend proves successful delivery.
    const artifact = (await queryClient<{ id: string; context_data: Record<string, unknown>; created_at: Date; is_paid: boolean }>(client,
      `SELECT h.id,h.context_data,h.created_at,h.is_paid FROM history h
       JOIN rune_transactions t ON t.id=$2 AND t.user_id=h.user_id AND t.type='spend' AND t.amount<0
       WHERE h.user_id=$1 AND h.context_data->>'transactionId'=$2::text
         AND ((t.action_type='READING' AND h.context_data->>'type'='reading' AND h.context_data->>'source'='ai'
           AND length(h.context_data->>'readingResourceKey')>0 AND length(trim(h.context_data->>'reading'))>0)
          OR (t.action_type IN ('DESTINY_CARD','FINAL_REPORT','SCENE_ILLUSTRATION','TAROT_ATMOSPHERE')
           AND h.context_data->>'type'='scene_image' AND length(h.context_data->>'sceneImageResourceKey')>0
           AND length(h.context_data->'sceneArt'->>(h.context_data->>'scene'))>0)
          OR (t.action_type='AURA_READING' AND h.context_data->>'type'='aura_reading'
           AND length(h.context_data->>'auraSnapshotId')>0 AND length(trim(h.context_data->>'report'))>0)
          OR (t.action_type='PALM_READING' AND h.context_data->>'type'='palm_reading'
           AND length(h.context_data->>'palmSnapshotId')>0 AND length(trim(h.context_data->>'report'))>0)
          OR (t.action_type='VISION_ANALYSIS' AND h.context_data->>'type'='photo_reading'
           AND length(h.context_data->>'photoSpreadKey')>0 AND length(trim(h.context_data->>'analysis'))>0)
          OR (t.action_type='INTENTION_SPREAD' AND h.context_data->>'type'='intention_spread'
           AND length(h.context_data->>'intentionResourceKey')>0 AND length(trim(h.context_data->>'reading'))>0)
          OR (t.action_type='DAILY_EXTENDED' AND h.context_data->>'type'='daily_reading'
           AND h.context_data->>'spreadId'='daily-extended' AND length(h.context_data->>'readingDate')>0
           AND length(trim(h.context_data->>'reading'))>0))
       ORDER BY h.created_at DESC LIMIT 1`, [userId,transactionId])).rows[0];
    if (!artifact) return null;
    const ctx = artifact.context_data;
    const delivery = ctx.receiptDelivery && typeof ctx.receiptDelivery === "object" && !Array.isArray(ctx.receiptDelivery)
      ? ctx.receiptDelivery as Record<string, unknown> : {};
    if (ctx.type === "intention_spread") return { ...delivery,reading:ctx.reading,historyId:artifact.id,isPaid:true,
      spreadId:ctx.spreadId,intention:ctx.intention,sessionId:ctx.sessionId };
    if (ctx.type === "daily_reading") return { ...delivery,text:ctx.reading,localDate:ctx.readingDate,
      cards:ctx.tarotCards,system:ctx.deckSystem,spreadId:ctx.spreadId,drawn:true,locked:false,purged:false };
    if (ctx.type === "reading") return { ...delivery, reading: ctx.reading, historyId: artifact.id,
      isPaid: artifact.is_paid, spreadId: ctx.spreadId, createdAt: artifact.created_at };
    if (ctx.type === "aura_reading" || ctx.type === "palm_reading") return { ...delivery,report:ctx.report,snapshot:ctx.snapshot,
      snapshotId:ctx.type === "aura_reading" ? ctx.auraSnapshotId : ctx.palmSnapshotId,historyId:artifact.id,saved:true };
    if (ctx.type === "photo_reading") {
      const { photoReadingJsonFromContext } = await import("@/lib/photo-reading-persist");
      return {...photoReadingJsonFromContext(ctx,{historyId:artifact.id}),...delivery,analysis:ctx.analysis,historyId:artifact.id,saved:true};
    }
    const scene = String(ctx.scene);
    const { sceneLabel } = await import("@/lib/image-prompts");
    return { ...delivery, imageUrl: (ctx.sceneArt as Record<string, unknown>)[scene], scene,
      sceneLabel: sceneLabel(scene as Parameters<typeof sceneLabel>[0]), historyId: artifact.id };
  }
  const { getUserMatrixReportById } = await import("@/lib/services/numerology-report-service");
  const { matrixReportDisplayMetadata } = await import("@/lib/numerology/matrix-report-display");
  const saved = await getUserMatrixReportById(userId, matrix.rows[0].id, client);
  if (!saved) throw new Error("matrix_delivery_recovery_missing");
  return { ...matrixReportDisplayMetadata(saved), reading: saved.content, reportId: saved.id,
    isPaid: true, matrixOwned: true, matrixSubjectId: saved.subjectId, createdAt: saved.createdAt };
}

/** A terminal old HD job must not refund a receipt acquired by a newer generation. */
export async function hdJobOwnsReceipt(client: PoolClient, job: AsyncJobRow): Promise<boolean> {
  if (job.kind !== "hd_report" && job.kind !== "hd_composite_report") return true;
  const table = job.kind === "hd_report" ? "hd_reports" : "hd_composite_reports";
  const row = (await queryClient<{generation_revision:string}>(client,`SELECT generation_revision FROM ${table} WHERE user_id=$1 AND transaction_id::text=$2 LIMIT 1`,[job.user_id,job.charge_transaction_id])).rows[0];
  if (!row) return true;
  return typeof job.period_metadata?.hd_generation_revision === "string" && row.generation_revision === job.period_metadata.hd_generation_revision;
}
