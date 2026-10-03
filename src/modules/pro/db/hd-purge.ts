import { queryClient, withTransaction } from "@/lib/db";
import { refundRunes } from "@/lib/rune-service";
import { lockPaidReportReceipt } from "@/lib/services/durable-report-receipt";
import { proQuery } from "../db";

class RetryDiscovery extends Error {}

/** Retire all frozen main-DB copies alongside the Pro case. Job locks precede
 * purchase/user locks, and a late enqueue restarts discovery before deletion. */
export async function purgeProHdCase(accountId: string | number, caseId: string | number): Promise<boolean> {
  const account = (await proQuery("SELECT user_id FROM pro.accounts WHERE id=$1", [accountId])).rows[0];
  if (!account) return false;
  const userId = account.user_id;
  for (let retry = 0; retry < 8; retry++) {
    try { return await withTransaction(async main => {
      const params = [userId,String(accountId),String(caseId)];
      const filter = "user_id=$1 AND kind='pro_premium_report' AND input->>'accountId'=$2 AND input->>'caseId'=$3";
      const jobs = (await queryClient(main, `SELECT * FROM async_jobs WHERE ${filter} ORDER BY id FOR UPDATE`, params)).rows;
      await queryClient(main,"SELECT pg_advisory_xact_lock(hashtextextended('pro-hd:'||$1::text,0))",[userId]);
      const current = (await queryClient(main, `SELECT id FROM async_jobs WHERE ${filter}`,params)).rows;
      if (current.some(row => !jobs.some(job => job.id === row.id))) throw new RetryDiscovery();
      for (const tx of [...new Set(jobs.map(job => job.charge_transaction_id).filter(Boolean))].sort()) await lockPaidReportReceipt(main, tx);
      await queryClient(main,"SELECT id FROM users WHERE id=$1 FOR UPDATE",[userId]);
      for (const job of jobs) {
        const receipt = (await proQuery("SELECT job_id FROM pro.hd_delivery_receipts WHERE job_id=$1 AND account_id=$2",[job.id,accountId])).rows[0];
        const delivered = Boolean(receipt || job.status === "completed");
        let refunded = job.billing_state === "refunded";
        if (!delivered && job.charge_transaction_id && !refunded) {
          const spend = (await queryClient(main,"SELECT -amount AS amount FROM rune_transactions WHERE id=$1 AND user_id=$2 AND type='spend' AND amount<0",[job.charge_transaction_id,userId])).rows[0];
          if (!spend) throw new Error("pro_hd_charge_missing");
          await refundRunes(userId,spend.amount,"Возврат: кейс удалён",undefined,job.charge_transaction_id,undefined,main);
          refunded = true;
        }
        await queryClient(main,`UPDATE async_jobs SET status=$2,billing_state=$3,
          input=input-'frozenPayload'-'frozenQuestion'-'frozenAlias'-'frozenPractitionerContext'-'refinement',
          result=$4::jsonb,error_code=CASE WHEN $2='failed' THEN 'source_deleted' ELSE NULL END,
          error_message=CASE WHEN $2='failed' THEN 'Кейс удалён, генерация отменена.' ELSE NULL END,
          worker_id=NULL,locked_at=NULL,completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1`,
          [job.id,delivered?"completed":"failed",refunded?"refunded":delivered?"completed":"unbilled",JSON.stringify({deleted:true,caseId:String(caseId),caseType:job.input.caseType})]);
      }
      await proQuery("DELETE FROM pro.audit_log WHERE account_id=$1 AND target=$2 AND action='case.refine_block'",[accountId,String(caseId)]);
      const result = await proQuery("DELETE FROM pro.cases WHERE id=$1 AND account_id=$2",[caseId,accountId]);
      return result.rowCount === 1;
    }); } catch (error) { if (!(error instanceof RetryDiscovery)) throw error; }
  }
  throw Object.assign(new Error("pro_hd_delete_busy"),{status:409});
}
