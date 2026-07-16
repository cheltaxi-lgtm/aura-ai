import type { NextRequest } from "next/server";

import {
  claimAsyncJobForSave,
  completeAsyncJob,
  failAsyncJob,
  getAsyncJobById,
  markAsyncJobCharged,
  markAsyncJobRefunded,
} from "@/lib/async-jobs";
import { getAsyncJobIdFromRequest } from "@/lib/async-job-worker-auth";
import { query } from "@/lib/db";
import type { RuneActionType } from "@/lib/rune-costs";
import { getRuneBalance } from "@/lib/rune-service";
import {
  BillingService,
  type BillingChargeResult,
} from "@/lib/services/billing-service";

/** After a successful charge on a worker-driven natal route. */
export async function trackWorkerJobCharged(
  request: NextRequest,
  transactionId: string | null | undefined
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId || !transactionId) return;
  await markAsyncJobCharged(jobId, transactionId);
}

/** After rollbackCharge on a worker-driven natal route. */
export async function trackWorkerJobRefunded(request: NextRequest): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  await markAsyncJobRefunded(jobId);
}

/** Route is source of truth: mark job completed when the handler succeeds. */
export async function trackWorkerJobCompleted(
  request: NextRequest,
  result: Record<string, unknown>
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  await completeAsyncJob(jobId, result);
}

/** Route failed after charge/refund handling; keep job terminal for the poller. */
export async function trackWorkerJobFailed(
  request: NextRequest,
  message: string,
  options?: { refunded?: boolean; errorCode?: string }
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  if (options?.refunded) {
    await markAsyncJobRefunded(jobId);
  }
  await failAsyncJob(jobId, message, options?.errorCode ?? "generation_failed");
}

async function billingChargeFromExistingTransaction(
  userId: string,
  transactionId: string,
  fallbackAction: RuneActionType
): Promise<BillingChargeResult | null> {
  const { rows } = await query<{ amount: number; action_type: string | null }>(
    `SELECT ABS(amount) AS amount, action_type
     FROM rune_transactions
     WHERE id = $1 AND user_id = $2 AND amount < 0
     LIMIT 1`,
    [transactionId, userId]
  );
  const ledger = rows[0];
  if (!ledger) return null;
  const newBalance = await getRuneBalance(userId);
  return {
    spentRunes: ledger.amount,
    wasFreeQuestion: false,
    newBalance,
    actionType: ledger.action_type || fallbackAction,
    slotReserved: false,
    transactionId,
  };
}

/**
 * Must run immediately before persisting a paid report on a worker job.
 * Wins against timeout-refund (which refuses to fail after save_claimed).
 */
export async function beginWorkerJobSave(request: NextRequest): Promise<boolean> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return true;
  if (request.signal.aborted) return false;
  return claimAsyncJobForSave(jobId);
}

/**
 * Charge once per async job. If the reaper requeues a job that already reached
 * billing_state=charged, reuse the existing ledger row instead of spending again.
 */
export async function chargeRuneActionForWorkerJob(input: {
  request: NextRequest;
  userId: string;
  action: RuneActionType;
}): Promise<BillingChargeResult> {
  const jobId = getAsyncJobIdFromRequest(input.request);
  if (jobId) {
    const job = await getAsyncJobById(jobId);
    if (
      job &&
      job.user_id === input.userId &&
      job.status === "running" &&
      job.billing_state === "charged" &&
      job.charge_transaction_id
    ) {
      const reused = await billingChargeFromExistingTransaction(
        input.userId,
        job.charge_transaction_id,
        input.action
      );
      if (reused) return reused;
    }
  }

  const charge = await BillingService.chargeRuneAction({
    userId: input.userId,
    action: input.action,
  });
  await trackWorkerJobCharged(input.request, charge.transactionId);
  return charge;
}
