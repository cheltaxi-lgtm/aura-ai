import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";

import { resolveUnlimitedAccess } from "@/lib/accounts";
import {
  claimAsyncJobForSave,
  completeAsyncJob,
  failAsyncJob,
  getAsyncJobById,
  isRetryableReportErrorCode,
  markAsyncJobCharged,
  markAsyncJobNeedsRegeneration,
  markAsyncJobRefunded,
  releaseAsyncJobSaveClaim,
  REPORT_JOB_MAX_ATTEMPTS,
  retryOrFailReportJob,
  updateAsyncJobProgress,
  asyncJobAttemptMatches,
  type AsyncJobRow,
} from "@/lib/async-jobs";
import {
  isReportJobKind,
  isReportJobRetryEnabled,
} from "@/lib/async-report-flags";
import { getAsyncJobIdFromRequest, getAsyncJobAttemptFromRequest } from "@/lib/async-job-worker-auth";
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import type { RuneActionType } from "@/lib/rune-costs";
import { getRuneSettings } from "@/lib/rune-settings";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import {
  BillingService,
  type BillingChargeResult,
} from "@/lib/services/billing-service";

/**
 * Build a throttled progress reporter for worker-driven generation.
 * Returns undefined for plain client calls (no job header) so routes can pass
 * it straight into pipeline opts.
 */
export function makeWorkerProgressReporter(
  request: NextRequest
): ((p: { done: number; total: number; label: string }) => void) | undefined {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return undefined;
  const attempt = getAsyncJobAttemptFromRequest(request);
  if (!attempt) return undefined;
  let lastWrite = 0;
  return (p) => {
    const now = Date.now();
    if (now - lastWrite < 2_000 && p.done < p.total) return;
    lastWrite = now;
    void updateAsyncJobProgress(jobId, {
      done: p.done,
      total: p.total,
      label: p.label,
    }, attempt).catch(() => undefined);
  };
}

/** After a successful charge on a worker-driven paid route. */
export async function trackWorkerJobCharged(
  request: NextRequest,
  transactionId: string | null | undefined
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId || !transactionId) return;
  const attempt = getAsyncJobAttemptFromRequest(request);
  if (attempt) await markAsyncJobCharged(jobId, transactionId, attempt);
}

/** After rollbackCharge on a worker-driven paid route. */
export async function trackWorkerJobRefunded(request: NextRequest): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  const attempt = getAsyncJobAttemptFromRequest(request);
  if (attempt) await markAsyncJobRefunded(jobId, attempt);
}

/** Lock the attempt across ledger refund and job binding. A delivered Matrix
 * receipt or a superseded attempt can never refund the current purchase. */
export async function refundWorkerJobCharge(request: NextRequest, params: Parameters<typeof BillingService.rollbackChargeEx>[0]): Promise<{ balance: number; refunded: boolean }> {
  const jobId = getAsyncJobIdFromRequest(request);
  const attempt = getAsyncJobAttemptFromRequest(request);
  return withTransaction(async client => {
    if (jobId) {
      const { rows } = await queryClient<AsyncJobRow>(client, `SELECT * FROM async_jobs WHERE id=$1 FOR UPDATE`, [jobId]);
      if (!rows[0] || rows[0].user_id !== params.userId || !attempt || !asyncJobAttemptMatches(rows[0], attempt) || rows[0].charge_transaction_id !== params.transactionId) {
        return { balance: await getRuneBalance(params.userId, client), refunded: false };
      }
    }
    if (params.transactionId) {
      const saved = await queryClient(client, `SELECT id FROM numerology_report_history WHERE user_id=$1 AND charge_transaction_id=$2 LIMIT 1`, [params.userId, params.transactionId]);
      if (saved.rows.length) return { balance: await getRuneBalance(params.userId, client), refunded: false };
    }
    const outcome = await BillingService.rollbackChargeEx({ ...params, client });
    if (params.cost > 0 && !outcome.refunded) throw new Error("reading_refund_failed");
    if (jobId && attempt && outcome.refunded) await markAsyncJobRefunded(jobId, attempt, client);
    return outcome;
  });
}

/**
 * Refund decision for a failing worker-driven paid route. When report retry
 * is enabled and the job WILL be requeued, the charge must stay in place —
 * the retry attempt reuses it (retryOrFailReportJob refunds once the retry
 * budget is exhausted). Refunding before a requeue would let the next
 * attempt charge the user twice for one report.
 */
export async function shouldRefundBeforeWorkerFail(
  request: NextRequest,
  errorCode: string
): Promise<boolean> {
  const jobId = getAsyncJobIdFromRequest(request);
  // Plain synchronous call (no job header) — retry is impossible, refund.
  if (!jobId) return true;
  if (!isReportJobRetryEnabled() || !isRetryableReportErrorCode(errorCode)) return true;
  const job = await getAsyncJobById(jobId);
  if (!job || job.status !== "running" || !isReportJobKind(job.kind)) return true;
  // Mirror retryOrFailReportJob: a requeue happens only under the attempt budget.
  return job.attempt_count >= REPORT_JOB_MAX_ATTEMPTS;
}

/** Route is source of truth: mark job completed when the handler succeeds. */
export async function trackWorkerJobCompleted(
  request: NextRequest,
  result: Record<string, unknown>
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  const attempt = getAsyncJobAttemptFromRequest(request);
  if (!attempt) return;
  await completeAsyncJob(jobId, result, attempt);
}

/**
 * Route failed after charge/refund handling; keep job terminal for the poller.
 * Report kinds with a retryable error code get an automatic requeue instead
 * (billing untouched — the retry reuses the existing charge); the budget is
 * enforced by retryOrFailReportJob, which fails + refunds once exhausted.
 */
export async function trackWorkerJobFailed(
  request: NextRequest,
  message: string,
  options?: { refunded?: boolean; errorCode?: string }
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  const attempt = getAsyncJobAttemptFromRequest(request);
  if (!attempt) return;
  const current = await getAsyncJobById(jobId);
  if (!current || !asyncJobAttemptMatches(current, attempt)) return;
  await releaseAsyncJobSaveClaim(jobId, attempt);
  const errorCode = options?.errorCode ?? "generation_failed";
  if (!options?.refunded && current.billing_state !== "refunded" && isReportJobRetryEnabled() && isRetryableReportErrorCode(errorCode)) {
    const job = await getAsyncJobById(jobId);
    if (job && job.status === "running" && isReportJobKind(job.kind)) {
      const outcome = await retryOrFailReportJob({ jobId, message, errorCode, attempt });
      if (outcome === "requeued") {
        console.warn(
          `[async-jobs] report auto-retry job=${jobId} kind=${job.kind} code=${errorCode} attempt=${job.attempt_count}`
        );
      }
      return;
    }
  }
  if (options?.refunded) {
    await markAsyncJobRefunded(jobId, attempt);
  }
  await failAsyncJob(jobId, message, errorCode, { attempt });
}

export async function trackWorkerJobNeedsRegeneration(
  request: NextRequest,
  message: string
): Promise<void> {
  const jobId = getAsyncJobIdFromRequest(request);
  if (!jobId) return;
  const attempt = getAsyncJobAttemptFromRequest(request);
  if (attempt) await markAsyncJobNeedsRegeneration(jobId, message, attempt);
}

async function billingChargeFromExistingTransaction(
  userId: string,
  transactionId: string,
  fallbackAction: RuneActionType,
  client?: PoolClient
): Promise<BillingChargeResult | null> {
  const execute = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) => queryClient<T>(client, text, params)
    : query;
  const { rows } = await execute<{ amount: number; action_type: string | null }>(
    `SELECT ABS(amount) AS amount, action_type
     FROM rune_transactions
     WHERE id = $1 AND user_id = $2 AND amount < 0
     LIMIT 1`,
    [transactionId, userId]
  );
  const ledger = rows[0];
  if (!ledger) return null;
  const newBalance = await getRuneBalance(userId, client);
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
  const attempt = getAsyncJobAttemptFromRequest(request);
  return attempt ? claimAsyncJobForSave(jobId, attempt) : false;
}

/** Request-free save barrier for an in-process worker runner. */
export async function beginWorkerJobSaveById(jobId: string): Promise<boolean> {
  if (!jobId.trim()) return false;
  return claimAsyncJobForSave(jobId);
}

export async function completeWorkerJobById(
  jobId: string,
  result: Record<string, unknown>
): Promise<boolean> {
  return completeAsyncJob(jobId, result);
}

export async function failWorkerJobById(
  jobId: string,
  message: string,
  options?: { refunded?: boolean; errorCode?: string }
): Promise<boolean> {
  if (options?.refunded) await markAsyncJobRefunded(jobId);
  return failAsyncJob(jobId, message, options?.errorCode ?? "generation_failed");
}

export async function markWorkerJobNeedsRegenerationById(
  jobId: string,
  message: string
): Promise<boolean> {
  return markAsyncJobNeedsRegeneration(jobId, message);
}

export async function markWorkerJobRefundedById(jobId: string): Promise<void> {
  await markAsyncJobRefunded(jobId);
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
  const attempt = getAsyncJobAttemptFromRequest(input.request);
  if (jobId) {
    const job = await getAsyncJobById(jobId);
    if (!job || job.user_id !== input.userId || !attempt || !asyncJobAttemptMatches(job, attempt)) throw new Error("stale_async_job_attempt");
    if (
      job &&
      job.user_id === input.userId &&
      attempt && asyncJobAttemptMatches(job, attempt) &&
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

  const unlimited = await resolveUnlimitedAccess({ profileUserId: input.userId });
  const runeSettings = await getRuneSettings();
  if (!isRuneBillingActive(input.userId, unlimited, runeSettings)) {
    const balance = await getRuneBalance(input.userId);
    return {
      spentRunes: 0,
      wasFreeQuestion: false,
      newBalance: balance,
      actionType: input.action,
      slotReserved: false,
    };
  }

  if (jobId) {
    return withTransaction(async client => {
      const { rows } = await queryClient<AsyncJobRow>(client, `SELECT * FROM async_jobs WHERE id=$1 FOR UPDATE`, [jobId]);
      const job = rows[0];
      if (!job || job.user_id !== input.userId || !attempt || !asyncJobAttemptMatches(job, attempt) || !["unbilled", "charged"].includes(job.billing_state)) throw new Error("stale_async_job_attempt");
      if (job.charge_transaction_id) {
        const reused = await billingChargeFromExistingTransaction(input.userId, job.charge_transaction_id, input.action, client);
        if (reused) return reused;
      }
      const charged = await BillingService.chargeRuneAction({ userId: input.userId,
        action: input.action, idempotencyKey: `async:${jobId}:${input.action}`, client });
      if (charged.transactionId) await markAsyncJobCharged(jobId, charged.transactionId, attempt, client);
      return charged;
    });
  }
  const charge = await BillingService.chargeRuneAction({
    userId: input.userId,
    action: input.action,
    // Synchronous reads have no durable operation bound to caller keys. A fresh
    // server purchase prevents reusing a cheaper or refunded transaction.
    idempotencyKey: `reading:${randomUUID()}`,
  });
  return charge;
}

/**
 * Request-free equivalent used by in-process runners. Reuses a previous charge
 * after requeue and records a new transaction before generation continues.
 */
export async function chargeRuneActionForWorkerJobById(input: {
  jobId: string;
  userId: string;
  action: RuneActionType;
}): Promise<BillingChargeResult> {
  const job = await getAsyncJobById(input.jobId);
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

  const unlimited = await resolveUnlimitedAccess({ profileUserId: input.userId });
  const runeSettings = await getRuneSettings();
  if (!isRuneBillingActive(input.userId, unlimited, runeSettings)) {
    const balance = await getRuneBalance(input.userId);
    return {
      spentRunes: 0,
      wasFreeQuestion: false,
      newBalance: balance,
      actionType: input.action,
      slotReserved: false,
    };
  }

  const charge = await BillingService.chargeRuneAction({
    userId: input.userId,
    action: input.action,
  });
  if (charge.transactionId) {
    await markAsyncJobCharged(input.jobId, charge.transactionId);
  }
  return charge;
}
