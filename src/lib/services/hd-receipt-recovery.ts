import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { refundRunes } from "@/lib/rune-service";
import { lockPaidReportReceipt } from "./durable-report-receipt";

type Receipt = { id:string;user_id:string;transaction_id:string|null;status:string;report_text:string|null;generation_revision:string;updated_at:Date;admin_rewrite_started_at?:Date|null };
const TABLES = ["hd_reports","hd_composite_reports"] as const;
class RetryDeletionDiscovery extends Error {}

async function refundReceipt(client:PoolClient,row:Receipt,composite:boolean):Promise<boolean> {
  if (!row.transaction_id) return false;
  const spend = (await queryClient<{amount:number}>(client,"SELECT -amount AS amount FROM rune_transactions WHERE id::text=$1 AND user_id=$2 AND type='spend'",[row.transaction_id,row.user_id])).rows[0];
  if (!spend) throw new Error("receipt_charge_missing");
  await refundRunes(row.user_id,spend.amount,"Возврат: разбор не был завершён",composite ? "HD_COMPOSITE_REPORT" : "HD_REPORT",row.transaction_id,undefined,client);
  return true;
}

/** Delete source, cancel pending work, settle held receipts and erase delivery
 * copies in one transaction. The purchase advisory closes the discovery/INSERT gap. */
export async function deleteHdChartAndReceipts(chartId:string,userId:string):Promise<boolean> {
  for(let retry=0;retry<8;retry++) { try { return await withTransaction(async client => {
    const observed = await queryClient<Receipt>(client,`SELECT id,user_id,transaction_id::text,status,report_text,generation_revision,updated_at FROM hd_reports WHERE user_id=$1 AND chart_id=$2
      UNION ALL SELECT id,user_id,transaction_id::text,status,report_text,generation_revision,updated_at FROM hd_composite_reports WHERE user_id=$1 AND (base_chart_id=$2 OR partner_chart_id=$2)`,[userId,chartId]);
    const reportIds = observed.rows.map(r => r.id);
    const jobs = await queryClient<{id:string;status:string;billing_state:string;charge_transaction_id:string|null}>(client,`SELECT * FROM async_jobs WHERE user_id=$1 AND
      (input->>'chartId'=$2 OR input->>'baseChartId'=$2 OR input->>'partnerChartId'=$2 OR result->>'reportId'=ANY($3::text[]) OR result->'report'->>'id'=ANY($3::text[]) OR period_metadata->>'hd_report_id'=ANY($3::text[]))
      ORDER BY id FOR UPDATE`,[userId,chartId,reportIds]);
    await queryClient(client,"SELECT pg_advisory_xact_lock(hashtextextended('hd-purchase:' || $1::text,0))",[userId]);
    const current = await queryClient<Receipt>(client,`SELECT * FROM hd_reports WHERE user_id=$1 AND chart_id=$2`,[userId,chartId]);
    const pairs = await queryClient<Receipt>(client,`SELECT * FROM hd_composite_reports WHERE user_id=$1 AND (base_chart_id=$2 OR partner_chart_id=$2)`,[userId,chartId]);
    const discovered = await queryClient<{id:string}>(client,`SELECT id FROM async_jobs WHERE user_id=$1 AND
      (input->>'chartId'=$2 OR input->>'baseChartId'=$2 OR input->>'partnerChartId'=$2 OR result->>'reportId'=ANY($3::text[]) OR result->'report'->>'id'=ANY($3::text[]) OR period_metadata->>'hd_report_id'=ANY($3::text[]))`,[userId,chartId,[...new Set([...reportIds,...current.rows.map(r=>r.id),...pairs.rows.map(r=>r.id)])]]);
    // A cached delivery may have bound itself while we waited for the purchase
    // lock. Restart before taking its job lock, preserving job -> purchase order.
    if(discovered.rows.some(row=>!jobs.rows.some(job=>job.id===row.id)))throw new RetryDeletionDiscovery();
    for (const tx of [...new Set([...current.rows,...pairs.rows].map(r => r.transaction_id).filter((t):t is string => Boolean(t)))].sort()) await lockPaidReportReceipt(client,tx);
    await queryClient(client,"SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
    const chart = await queryClient(client,"SELECT id FROM hd_charts WHERE id=$1 AND user_id=$2 FOR UPDATE",[chartId,userId]);
    if (!chart.rows.length) return false;
    const refunds = new Set<string>();
    for (const [table,rows] of [["hd_reports",current.rows],["hd_composite_reports",pairs.rows]] as const) {
      for (const observedRow of rows) {
        const row = (await queryClient<Receipt>(client,`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[observedRow.id])).rows[0];
        const delivered = row.report_text?.trim() && (row.status === "done" || (row.status === "pending" && (table === "hd_composite_reports" || row.admin_rewrite_started_at)));
        if (!delivered && await refundReceipt(client,row,table === "hd_composite_reports") && row.transaction_id) refunds.add(row.transaction_id);
      }
    }
    for (const job of jobs.rows) {
      const refunded = job.charge_transaction_id && refunds.has(job.charge_transaction_id);
      await queryClient(client,`UPDATE async_jobs SET status=CASE WHEN status='completed' THEN 'completed' ELSE 'failed' END,
        billing_state=CASE WHEN $2 OR billing_state='refunded' THEN 'refunded' WHEN status='completed' THEN 'completed' ELSE 'unbilled' END,
        input='{}'::jsonb,result=$3::jsonb,error_code=CASE WHEN status='completed' THEN NULL ELSE 'source_deleted' END,
        error_message=CASE WHEN status='completed' THEN NULL ELSE 'Карта удалена, генерация отменена.' END,
        worker_id=NULL,locked_at=NULL,completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1`,[job.id,Boolean(refunded),JSON.stringify({deleted:true,chartId})]);
    }
    await queryClient(client,`INSERT INTO user_memory_source_suppressions(user_id,source_entity_id)
      SELECT $1,unnest($2::uuid[]) ON CONFLICT DO NOTHING`,[userId,[chartId,...current.rows.map(r => r.id),...pairs.rows.map(r => r.id)]]);
    await queryClient(client,"DELETE FROM hd_charts WHERE id=$1 AND user_id=$2",[chartId,userId]);
    return true;
  }); }catch(error){if(!(error instanceof RetryDeletionDiscovery))throw error;} }
  throw Object.assign(new Error("hd_delete_busy"),{status:409});
}

/** Candidate discovery is read-only; the refund decision is revalidated while
 * holding delivery, receipt and user locks, including active queue work. */
export async function reconcileHdReceipts(limit=50):Promise<number> {
  let count = 0;
  for (const table of TABLES) {
    const candidates = await query<Receipt>(`SELECT * FROM ${table} WHERE status IN ('pending','error','needs_regeneration')
      AND updated_at<now()-interval '1 hour' ORDER BY updated_at LIMIT $1`,[Math.min(500,Math.max(1,limit))]);
    for (const candidate of candidates.rows) {
      try { count += await withTransaction(async client => {
        const jobs = await queryClient<{id:string;status:string}>(client,`SELECT id,status FROM async_jobs WHERE user_id=$1 AND
          (charge_transaction_id::text=$2 OR period_metadata->>'hd_report_id'=$3) ORDER BY id FOR UPDATE`,[candidate.user_id,candidate.transaction_id,candidate.id]);
        await queryClient(client,"SELECT pg_advisory_xact_lock(hashtextextended('hd-purchase:' || $1::text,0))",[candidate.user_id]);
        await lockPaidReportReceipt(client,candidate.transaction_id);
        await queryClient(client,"SELECT id FROM users WHERE id=$1 FOR UPDATE",[candidate.user_id]);
        const row = (await queryClient<Receipt>(client,`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,[candidate.id])).rows[0];
        if (!row || row.generation_revision!==candidate.generation_revision || row.transaction_id!==candidate.transaction_id || !["pending","error","needs_regeneration"].includes(row.status) || new Date(row.updated_at).getTime()>Date.now()-3600_000) return 0;
        if (row.report_text?.trim() && (table === "hd_composite_reports" && row.status === "pending" || row.admin_rewrite_started_at)) {
          await queryClient(client,`UPDATE ${table} SET status='done',error=NULL,generation_revision=gen_random_uuid(),updated_at=now() ${table === "hd_reports" ? ",admin_rewrite_started_at=NULL" : ""} WHERE id=$1`,[row.id]);
          return 0;
        }
        if (jobs.rows.some(j => ["pending","running"].includes(j.status))) return 0;
        const active = (await queryClient(client,`SELECT id FROM async_jobs WHERE user_id=$1 AND status IN ('pending','running')
          AND ((kind='hd_report' AND input->>'chartId'=(SELECT chart_id::text FROM hd_reports WHERE id=$2))
          OR (kind='hd_composite_report' AND (input->>'baseChartId'=(SELECT base_chart_id::text FROM hd_composite_reports WHERE id=$2)
          OR input->>'partnerChartId'=(SELECT partner_chart_id::text FROM hd_composite_reports WHERE id=$2)))) LIMIT 1`,[row.user_id,row.id])).rows[0];
        if (active) return 0;
        const refunded = await refundReceipt(client,row,table === "hd_composite_reports");
        await queryClient(client,`UPDATE ${table} SET status='error',error='charge_refunded_reconcile',transaction_id=NULL,generation_revision=gen_random_uuid(),updated_at=now() WHERE id=$1`,[row.id]);
        if (refunded) for (const job of jobs.rows) await queryClient(client,"UPDATE async_jobs SET billing_state='refunded',updated_at=now() WHERE id=$1 AND billing_state IN ('charged','unbilled')",[job.id]);
        return refunded ? 1 : 0;
      }); } catch {
        // One inconsistent legacy receipt must not block every other refund.
        // Its unchanged purchase remains available for the next repair pass.
        console.error("[hd-reconcile] candidate settlement failed", {table});
      }
    }
  }
  return count;
}
