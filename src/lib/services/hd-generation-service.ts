import { createHash, randomUUID } from "node:crypto";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { markAsyncJobCharged, markAsyncJobRefunded, type AsyncJobRow } from "@/lib/async-jobs";
import { chargeRuneAction, type BillingChargeResult } from "@/lib/services/billing-service";
import { getRuneBalance, refundRunes } from "@/lib/rune-service";
import {
  completeReportWorkerSave, lockPaidReportReceipt, lockReportWorkerSave,
  paidReportCanSave, type ReportWorkerJob,
} from "./durable-report-receipt";
import {
  getHdReportById, getHdCompositeReportById, toPublicHdReport, toPublicHdCompositeReport,
  type HdChartRow, type HdReportRow, type HdCompositeReportRow,
} from "./human-design-service";

export type HdGenerationGuard = {
  kind: "personal" | "composite";
  userId: string;
  reportId: string;
  revision: string;
  transactionId: string | null;
  worker?: ReportWorkerJob;
};

type Receipt = {
  id: string; user_id: string; generation_revision: string; transaction_id: string | null;
  status: string; report_text: string | null; created_at: Date; updated_at: Date;
  admin_rewrite_started_at?: Date | null; chart_snapshot?: HdChartRow | null;
  base_snapshot?: HdChartRow | null; partner_snapshot?: HdChartRow | null;
  generation_context?: { context: Record<string,unknown>; chartOrder: string[] } | null;
};

const tableFor = (kind: HdGenerationGuard["kind"]) => kind === "personal" ? "hd_reports" : "hd_composite_reports";
export class HdGenerationConflict extends Error {}

export async function lockActiveHdUser(client: PoolClient, userId: string): Promise<void> {
  const user = (await queryClient<{ erasure_requested_at: unknown }>(client,
    "SELECT erasure_requested_at FROM users WHERE id=$1 FOR UPDATE", [userId])).rows[0];
  if (!user || user.erasure_requested_at) throw new HdGenerationConflict("account_inactive");
}

export async function assertActiveHdSource(userId:string,source:{chartId?:string;reportId?:string;revision?:string}):Promise<void> {
  await withTransaction(async client => {
    await lockActiveHdUser(client,userId);
    const found = source.chartId
      ? await queryClient(client,"SELECT id FROM hd_charts WHERE id=$1 AND user_id=$2 FOR SHARE",[source.chartId,userId])
      : await queryClient(client,"SELECT id FROM hd_reports WHERE id=$1 AND user_id=$2 AND generation_revision=$3 FOR SHARE",[source.reportId,userId,source.revision]);
    if (!found.rows.length) throw new HdGenerationConflict("source_changed_or_deleted");
  });
}

/** Identity of the frozen mechanics and interpretation context, including folds
 * and unknown time. Live chart IDs and editable place labels are not identities. */
export function hdPurchaseIdentity(charts: HdChartRow[], context: Record<string, unknown>): string {
  const subjects = charts.map(row => ({
    utc: row.chart.birth?.utcIso, timeKnown: row.chart.timeKnown,
    date: row.chart.birth?.date, timezone: row.chart.timezone,
    engine: row.engineVersion,
    subject: row.subjectKind, name: row.subjectName?.trim().toLocaleLowerCase("ru") ?? "",
    gender: row.gender,
  }));
  return createHash("sha256").update(JSON.stringify({ v: 2, subjects, context })).digest("hex");
}

async function publicResult(client: PoolClient, kind: HdGenerationGuard["kind"], id: string, userId: string) {
  const report = kind === "personal" ? await getHdReportById(id,userId,client) : await getHdCompositeReportById(id,userId,client);
  if (!report) throw new HdGenerationConflict("report_row_lost");
  return { report: kind === "personal" ? toPublicHdReport(report as HdReportRow) : toPublicHdCompositeReport(report as HdCompositeReportRow), reportId: id };
}

/** Acquire, charge, freeze evidence and bind the durable worker atomically. */
export async function acquireHdGeneration(opts: {
  kind: HdGenerationGuard["kind"]; userId: string; charts: HdChartRow[];
  exempt: boolean; worker?: ReportWorkerJob; context: Record<string, unknown>;
}): Promise<{ cached: Record<string, unknown> } | { guard: HdGenerationGuard; charts: HdChartRow[]; context:Record<string,unknown>; charge: BillingChargeResult }> {
  const table = tableFor(opts.kind);
  const ids = opts.charts.map(c => c.id).sort();
  const identity = hdPurchaseIdentity(opts.charts, opts.context);
  return withTransaction(async client => {
    if (!(await lockReportWorkerSave(client,opts.userId,opts.worker))) throw new HdGenerationConflict("stale_async_job_attempt");
    // Serialize same-user purchases before FK inserts and balance locks.
    await queryClient(client,"SELECT pg_advisory_xact_lock(hashtextextended('hd-purchase:' || $1::text,0))",[opts.userId]);
    const condition = opts.kind === "personal" ? "chart_id=$2" : "base_chart_id=$2 AND partner_chart_id=$3";
    const params = opts.kind === "personal" ? [opts.userId,ids[0]] : [opts.userId,...ids];
    const observed = (await queryClient<Receipt>(client,`SELECT * FROM ${table} WHERE user_id=$1 AND ${condition}`,params)).rows[0];
    const observedDuplicate = (await queryClient<Receipt>(client,`SELECT * FROM ${table} WHERE user_id=$1 AND semantic_identity=$2 AND id IS DISTINCT FROM $3::uuid ORDER BY created_at DESC LIMIT 1`,[opts.userId,identity,observed?.id ?? null])).rows[0];
    for (const tx of [...new Set([observed?.transaction_id,observedDuplicate?.transaction_id].filter((t): t is string => Boolean(t)))].sort()) await lockPaidReportReceipt(client,tx);
    await lockActiveHdUser(client,opts.userId);
    const owned = await queryClient<{ id: string; fingerprint: string; engine_version: string }>(client,
      "SELECT id,fingerprint,engine_version FROM hd_charts WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE",[opts.userId,ids]);
    if (owned.rows.length !== ids.length || owned.rows.some(row => !opts.charts.some(c => c.id === row.id && c.fingerprint === row.fingerprint && c.engineVersion === row.engine_version))) throw new HdGenerationConflict("chart_state_changed");
    let receipt = observed ? (await queryClient<Receipt>(client,`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[observed.id])).rows[0] : undefined;
    if (receipt && receipt.transaction_id !== observed?.transaction_id) throw new HdGenerationConflict("report_state_changed");
    const readable = (r: Receipt) => Boolean(r.report_text?.trim()) && (r.status === "done" || (r.status === "pending" && (opts.kind === "composite" || Boolean(r.admin_rewrite_started_at))));
    if (receipt && readable(receipt)) {
      const cached = await publicResult(client,opts.kind,receipt.id,opts.userId);
      await completeReportWorkerSave(client,opts.userId,opts.worker,cached);
      return { cached };
    }
    const held = receipt?.transaction_id && await paidReportCanSave(client,receipt.transaction_id) ? receipt.transaction_id : null;
    // Held duplicates under another chart must also block a second purchase.
    const duplicate = observedDuplicate ? (await queryClient<Receipt>(client,`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[observedDuplicate.id])).rows[0] : undefined;
    if (duplicate && duplicate.transaction_id !== observedDuplicate?.transaction_id) throw new HdGenerationConflict("report_state_changed");
    if (!held && duplicate && readable(duplicate)) {
      const cached = await publicResult(client,opts.kind,duplicate.id,opts.userId);
      await completeReportWorkerSave(client,opts.userId,opts.worker,cached);
      return { cached };
    }
    if (!held && duplicate && duplicate.transaction_id && await paidReportCanSave(client,duplicate.transaction_id)) throw new HdGenerationConflict("CLAIM_BUSY");
    if (receipt?.status === "pending") {
      if (opts.worker) {
        const bound = (await queryClient<AsyncJobRow>(client,"SELECT * FROM async_jobs WHERE id=$1",[opts.worker.jobId])).rows[0];
        if (bound.period_metadata?.hd_generation_revision === receipt.generation_revision &&
            bound.period_metadata?.hd_generation_attempt === opts.worker.attempt.attemptCount &&
            bound.period_metadata?.hd_generation_worker === opts.worker.attempt.workerId) throw new HdGenerationConflict("CLAIM_BUSY");
      }
      const activeJob = (await queryClient(client,`SELECT id FROM async_jobs WHERE user_id=$1 AND status IN ('pending','running')
        AND kind=$2 AND (input->>'chartId'=$3 OR (input->>'baseChartId'=ANY($4::text[]) AND input->>'partnerChartId'=ANY($4::text[])))
        AND ($5::uuid IS NULL OR id<>$5::uuid) LIMIT 1`,[opts.userId,opts.kind === "personal" ? "hd_report" : "hd_composite_report",ids[0],ids,opts.worker?.jobId ?? null])).rows[0];
      if (activeJob || (!opts.worker && Date.now() - new Date(receipt.created_at).getTime() < 15*60_000)) throw new HdGenerationConflict("CLAIM_BUSY");
    }
    const revision = randomUUID();
    let charts = opts.charts;
    let context = opts.context;
    if (held && receipt) {
      const frozen = opts.kind === "personal" ? [receipt.chart_snapshot] : [receipt.base_snapshot,receipt.partner_snapshot];
      if (frozen.every(c => c?.chart)) charts = frozen as HdChartRow[];
      if (receipt.generation_context) {
        context = receipt.generation_context.context;
        const order = receipt.generation_context.chartOrder;
        charts = [...charts].sort((a,b) => order.indexOf(a.id)-order.indexOf(b.id));
      } else charts = [...charts].sort((a,b) => opts.charts.findIndex(c => c.id === a.id)-opts.charts.findIndex(c => c.id === b.id));
    }
    if (!receipt) {
      const inserted = opts.kind === "personal"
        ? await queryClient<Receipt>(client,`INSERT INTO hd_reports(chart_id,user_id,status,package_id,included_asks_remaining,report_tone,generation_revision,semantic_identity,chart_snapshot)
            VALUES($1,$2,'pending','max',5,'personal',$3,$4,$5::jsonb) RETURNING *`,[ids[0],opts.userId,revision,identity,JSON.stringify(charts[0])])
        : await queryClient<Receipt>(client,`INSERT INTO hd_composite_reports(base_chart_id,partner_chart_id,user_id,status,generation_revision,semantic_identity,base_snapshot,partner_snapshot)
            VALUES($1,$2,$3,'pending',$4,$5,$6::jsonb,$7::jsonb) RETURNING *`,[...ids,opts.userId,revision,identity,JSON.stringify(charts.find(c => c.id === ids[0])),JSON.stringify(charts.find(c => c.id === ids[1]))]);
      receipt = inserted.rows[0];
    } else {
      await queryClient(client,`UPDATE ${table} SET status='pending',generation_revision=$2,error=NULL,created_at=now(),updated_at=now() WHERE id=$1`,[receipt.id,revision]);
    }
    const action = opts.kind === "personal" ? "HD_REPORT" : "HD_COMPOSITE_REPORT";
    let charge: BillingChargeResult;
    if (held) {
      const spend = (await queryClient<{ amount: number; action_type: string }>(client,"SELECT amount,action_type FROM rune_transactions WHERE id=$1 AND user_id=$2 AND type='spend'",[held,opts.userId])).rows[0];
      if (!spend) throw new HdGenerationConflict("receipt_charge_missing");
      charge = { spentRunes: -spend.amount, transactionId: held, actionType: spend.action_type, wasFreeQuestion: false, slotReserved: false, newBalance: await getRuneBalance(opts.userId,client) };
    } else charge = await chargeRuneAction({ userId: opts.userId, action, exempt: opts.exempt, client, idempotencyKey: `hd:${opts.kind}:${receipt.id}:${revision}` });
    const transactionId = charge.transactionId ?? null;
    await queryClient(client,`UPDATE ${table} SET transaction_id=$2,semantic_identity=$3 WHERE id=$1`,[receipt.id,transactionId,held ? (observed as Receipt & { semantic_identity?: string }).semantic_identity ?? identity : identity]);
    await queryClient(client,`UPDATE ${table} SET generation_context=$2::jsonb WHERE id=$1`,[receipt.id,JSON.stringify({context,chartOrder:charts.map(c => c.id)})]);
    if (!held) {
      if (opts.kind === "personal") await queryClient(client,"UPDATE hd_reports SET chart_snapshot=$2::jsonb,report_text=NULL WHERE id=$1",[receipt.id,JSON.stringify(charts[0])]);
      else await queryClient(client,"UPDATE hd_composite_reports SET base_snapshot=$2::jsonb,partner_snapshot=$3::jsonb,report_text=NULL WHERE id=$1",[receipt.id,JSON.stringify(charts.find(c => c.id === ids[0])),JSON.stringify(charts.find(c => c.id === ids[1]))]);
    }
    if (opts.worker) {
      if (transactionId) await markAsyncJobCharged(opts.worker.jobId,transactionId,opts.worker.attempt,client);
      await queryClient(client,`UPDATE async_jobs SET period_metadata=COALESCE(period_metadata,'{}'::jsonb)||$2::jsonb WHERE id=$1`,[opts.worker.jobId,JSON.stringify({ hd_generation_revision: revision, hd_generation_attempt:opts.worker.attempt.attemptCount,hd_generation_worker:opts.worker.attempt.workerId,hd_report_id: receipt.id, hd_kind: opts.kind })]);
    }
    return { guard: { kind: opts.kind, userId: opts.userId, reportId: receipt.id, revision, transactionId, worker: opts.worker }, charts, context, charge };
  });
}

async function lockGeneration(client: PoolClient, guard: HdGenerationGuard, allowErasure = false): Promise<Receipt | null> {
  if (!(await lockReportWorkerSave(client,guard.userId,guard.worker,guard.transactionId ?? undefined))) return null;
  await lockPaidReportReceipt(client,guard.transactionId);
  if (allowErasure) await queryClient(client,"SELECT id FROM users WHERE id=$1 FOR UPDATE",[guard.userId]);
  else await lockActiveHdUser(client,guard.userId);
  const row = (await queryClient<Receipt>(client,`SELECT * FROM ${tableFor(guard.kind)} WHERE id=$1 AND user_id=$2 FOR UPDATE`,[guard.reportId,guard.userId])).rows[0];
  return row && row.generation_revision === guard.revision && row.transaction_id === guard.transactionId && row.status === "pending" ? row : null;
}

export async function assertHdGenerationCurrent(guard: HdGenerationGuard): Promise<void> {
  await withTransaction(async client => {
    if (!(await lockGeneration(client,guard)) || !(await paidReportCanSave(client,guard.transactionId))) throw new HdGenerationConflict("stale_hd_generation");
  });
}

export async function acquireHdAdminGeneration(reportId:string,userId:string):Promise<HdGenerationGuard|null> {
  return withTransaction(async client => {
    const jobs = await queryClient<AsyncJobRow>(client,`SELECT * FROM async_jobs WHERE user_id=$1 AND period_metadata->>'hd_report_id'=$2 ORDER BY id FOR UPDATE`,[userId,reportId]);
    if (jobs.rows.some(j => ["pending","running"].includes(j.status))) return null;
    const observed = (await queryClient<Receipt>(client,"SELECT * FROM hd_reports WHERE id=$1 AND user_id=$2",[reportId,userId])).rows[0];
    if (!observed) return null;
    await lockPaidReportReceipt(client,observed.transaction_id);
    await lockActiveHdUser(client,userId);
    const row = (await queryClient<Receipt>(client,"SELECT * FROM hd_reports WHERE id=$1 AND user_id=$2 FOR UPDATE",[reportId,userId])).rows[0];
    if (!row || !["done","error","needs_regeneration"].includes(row.status) || row.transaction_id!==observed.transaction_id || !(await paidReportCanSave(client,row.transaction_id))) return null;
    const revision = randomUUID();
    await queryClient(client,`UPDATE hd_reports SET status='pending',generation_revision=$2,
      admin_rewrite_started_at=CASE WHEN status='done' THEN now() ELSE NULL END,error=NULL,created_at=now(),updated_at=now() WHERE id=$1`,[reportId,revision]);
    return {kind:"personal",userId,reportId,revision,transactionId:row.transaction_id};
  });
}

export async function restoreHdGeneration(guard:HdGenerationGuard):Promise<void> {
  await withTransaction(async client => {
    const row = await lockGeneration(client,guard,true);
    if (!row) return;
    await queryClient(client,`UPDATE hd_reports SET status=CASE WHEN admin_rewrite_started_at IS NOT NULL AND length(trim(report_text))>0 THEN 'done' ELSE 'error' END,
      admin_rewrite_started_at=NULL,error=CASE WHEN admin_rewrite_started_at IS NOT NULL THEN NULL ELSE 'generation_failed' END,
      generation_revision=gen_random_uuid(),updated_at=now() WHERE id=$1`,[guard.reportId]);
  });
}

/** The report and its delivery commit together; no save_claimed crash window. */
export async function saveHdGeneration(guard: HdGenerationGuard, text: string, model: string, charts: HdChartRow[], meta?: { costRub: number | null; usage: unknown; calls: number }): Promise<Record<string, unknown> | null> {
  return withTransaction(async client => {
    if (!(await lockGeneration(client,guard)) || !(await paidReportCanSave(client,guard.transactionId))) return null;
    if (guard.kind === "personal") await queryClient(client,`UPDATE hd_reports SET status='done',generation_revision=gen_random_uuid(),report_text=$2,model=$3,chart_snapshot=$4::jsonb,
      cost_rub=$5,token_usage=$6::jsonb,llm_calls=$7,error=NULL,quality_findings=NULL,admin_rewrite_started_at=NULL,updated_at=now() WHERE id=$1`,
      [guard.reportId,text,model,JSON.stringify(charts[0]),meta?.costRub ?? null,JSON.stringify(meta?.usage ?? null),meta?.calls ?? null]);
    else await queryClient(client,`UPDATE hd_composite_reports SET status='done',generation_revision=gen_random_uuid(),report_text=$2,model=$3,
      base_snapshot=CASE WHEN base_chart_id=$4 THEN $5::jsonb ELSE $6::jsonb END,
      partner_snapshot=CASE WHEN partner_chart_id=$4 THEN $5::jsonb ELSE $6::jsonb END,error=NULL,updated_at=now() WHERE id=$1`,
      [guard.reportId,text,model,charts[0].id,JSON.stringify(charts[0]),JSON.stringify(charts[1])]);
    const result = await publicResult(client,guard.kind,guard.reportId,guard.userId);
    await completeReportWorkerSave(client,guard.userId,guard.worker,result);
    return result;
  });
}

/** A failed generation either retains a fenced retryable purchase or returns
 * its exact spend once. Late attempts and already delivered text are immutable. */
export async function failHdGeneration(guard: HdGenerationGuard, reason: string, refund: boolean, draft?: { text: string; findings: unknown }): Promise<boolean> {
  return withTransaction(async client => {
    const row = await lockGeneration(client,guard,true);
    if (!row) return false;
    if (row.report_text?.trim() && row.admin_rewrite_started_at) return false;
    let refunded = false;
    if (refund && guard.transactionId) {
      const spend = (await queryClient<{ amount: number }>(client,"SELECT -amount AS amount FROM rune_transactions WHERE id=$1 AND user_id=$2 AND type='spend'",[guard.transactionId,guard.userId])).rows[0];
      if (!spend) throw new Error("receipt_charge_missing");
      await refundRunes(guard.userId,spend.amount,"Возврат: разбор не был завершён",guard.kind === "personal" ? "HD_REPORT" : "HD_COMPOSITE_REPORT",guard.transactionId,undefined,client);
      refunded = true;
      if (guard.worker) await markAsyncJobRefunded(guard.worker.jobId,guard.worker.attempt,client);
    }
    await queryClient(client,`UPDATE ${tableFor(guard.kind)} SET status='error',error=$2,transaction_id=CASE WHEN $3 THEN NULL ELSE transaction_id END,
      generation_revision=CASE WHEN $3 THEN gen_random_uuid() ELSE generation_revision END,updated_at=now() WHERE id=$1`,[guard.reportId,reason.slice(0,500),refunded]);
    if (draft && guard.kind === "personal") await queryClient(client,"UPDATE hd_reports SET report_text=$2,quality_findings=$3::jsonb,quality_updated_at=now() WHERE id=$1",[guard.reportId,draft.text,JSON.stringify(draft.findings)]);
    return refunded;
  });
}
