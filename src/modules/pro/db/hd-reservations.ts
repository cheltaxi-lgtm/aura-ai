import { queryClient, type PoolClient } from "@/lib/db";
import { proQuery } from "../db";

/** Caller holds the main user's Pro advisory lock. Only a terminal,
 * undelivered reservation can release the shared trial budget. */
export async function reconcileProHdReservations(main: PoolClient, userId: string,
  accountId: string | number, run: typeof proQuery = proQuery): Promise<void> {
  const reservations = (await run("SELECT idempotency_key FROM pro.usage_log WHERE account_id=$1 AND idempotency_key LIKE 'pro-hd:%'", [accountId])).rows;
  for (const reservation of reservations) {
    const id = reservation.idempotency_key.slice(7);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue;
    const job = (await queryClient(main, "SELECT status,billing_state FROM async_jobs WHERE id=$1 AND user_id=$2", [id,userId])).rows[0];
    if (job && job.billing_state !== "refunded" && !(job.status === "failed" && job.billing_state === "unbilled")) continue;
    const receipt = (await run("SELECT job_id FROM pro.hd_delivery_receipts WHERE job_id=$1 AND account_id=$2", [id,accountId])).rows[0];
    if (!receipt) await run("DELETE FROM pro.usage_log WHERE account_id=$1 AND idempotency_key=$2", [accountId,reservation.idempotency_key]);
  }
}
