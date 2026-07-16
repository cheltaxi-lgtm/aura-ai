import { query, withTransaction } from "@/lib/db";
import { BillingService } from "@/lib/services/billing-service";

export type AsyncJobKind =
  | "reading"
  | "image_generate"
  | "natal_interpretation"
  | "natal_forecast"
  | "natal_compatibility";
export type AsyncJobStatus = "pending" | "running" | "completed" | "failed";
export type AsyncJobBillingState = "unbilled" | "charged" | "refunded" | "completed";

export type AsyncJobRow = {
  id: string;
  user_id: string;
  kind: AsyncJobKind;
  status: AsyncJobStatus;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  expires_at: Date;
  locked_at: Date | null;
  worker_id: string | null;
  attempt_count: number;
  period_metadata: Record<string, unknown>;
  error_code: string | null;
  billing_state: AsyncJobBillingState;
  charge_transaction_id: string | null;
};

const JOB_SELECT = `id, user_id, kind, status, input, result, error_message,
            created_at, updated_at, completed_at, expires_at,
            locked_at, worker_id, attempt_count, period_metadata, error_code,
            billing_state, charge_transaction_id`;

export async function createAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
  periodMetadata?: Record<string, unknown>;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO async_jobs (user_id, kind, input, period_metadata)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id`,
    [input.userId, input.kind, JSON.stringify(input.payload), JSON.stringify(input.periodMetadata ?? {})]
  );
  return rows[0]!.id;
}

/** Return an in-flight job with the same payload instead of enqueueing a duplicate. */
export async function findActiveAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
}): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    `SELECT id
     FROM async_jobs
     WHERE user_id = $1
       AND kind = $2
       AND status IN ('pending', 'running')
       AND expires_at > NOW()
       AND input = $3::jsonb
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.userId, input.kind, JSON.stringify(input.payload)]
  );
  return rows[0]?.id ?? null;
}

export async function getAsyncJobForUser(
  jobId: string,
  userId: string
): Promise<AsyncJobRow | null> {
  const { rows } = await query<AsyncJobRow>(
    `SELECT ${JOB_SELECT}
     FROM async_jobs
     WHERE id = $1 AND user_id = $2`,
    [jobId, userId]
  );
  return rows[0] ?? null;
}

export async function getAsyncJobById(jobId: string): Promise<AsyncJobRow | null> {
  const { rows } = await query<AsyncJobRow>(
    `SELECT ${JOB_SELECT}
     FROM async_jobs
     WHERE id = $1`,
    [jobId]
  );
  return rows[0] ?? null;
}

export async function claimAsyncJobs(input: {
  workerId: string;
  limit?: number;
  kinds?: AsyncJobKind[];
}): Promise<AsyncJobRow[]> {
  const limit = Math.min(Math.max(input.limit ?? 1, 1), 20);
  const kinds = input.kinds ?? [];
  return withTransaction(async (client) => {
    const { rows } = await client.query<AsyncJobRow>(
      `WITH candidates AS (
         SELECT id
         FROM async_jobs
         WHERE status = 'pending'
           AND expires_at > NOW()
           AND (cardinality($2::text[]) = 0 OR kind = ANY($2::text[]))
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE async_jobs jobs
       SET status = 'running',
           worker_id = $3,
           locked_at = NOW(),
           attempt_count = jobs.attempt_count + 1,
           updated_at = NOW()
       FROM candidates
       WHERE jobs.id = candidates.id
       RETURNING jobs.id, jobs.user_id, jobs.kind, jobs.status, jobs.input,
                 jobs.result, jobs.error_message, jobs.created_at, jobs.updated_at,
                 jobs.completed_at, jobs.expires_at, jobs.locked_at, jobs.worker_id,
                 jobs.attempt_count, jobs.period_metadata, jobs.error_code,
                 jobs.billing_state, jobs.charge_transaction_id`,
      [limit, kinds, input.workerId]
    );
    return rows;
  });
}

/**
 * Reset or fail jobs stuck in `running` after a worker crash / hard kill.
 * Fresh stale jobs return to `pending` (up to maxAttempts); older ones fail.
 * Requeue preserves billing_state=charged — natal routes must reuse the ledger
 * via chargeRuneActionForWorkerJob (no second spend).
 */
export async function reapStaleRunningAsyncJobs(input?: {
  staleAfterMs?: number;
  maxAttempts?: number;
  kinds?: AsyncJobKind[];
}): Promise<{ requeued: number; failed: number }> {
  const staleAfterMs = Math.max(60_000, input?.staleAfterMs ?? 12 * 60_000);
  const maxAttempts = Math.max(1, input?.maxAttempts ?? 3);
  const kinds = input?.kinds ?? [];
  const staleSeconds = Math.floor(staleAfterMs / 1000);

  const { requeued, failedIds } = await withTransaction(async (client) => {
    const { rows: requeuedRows } = await client.query<{ id: string }>(
      `UPDATE async_jobs
       SET status = 'pending',
           worker_id = NULL,
           locked_at = NULL,
           updated_at = NOW()
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < NOW() - make_interval(secs => $1)
         AND attempt_count < $2
         AND expires_at > NOW()
         AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
       RETURNING id`,
      [staleSeconds, maxAttempts, kinds]
    );

    const { rows: failedRows } = await client.query<{ id: string }>(
      `UPDATE async_jobs
       SET status = 'failed',
           error_message = 'Worker did not finish the job in time. Status reset failed after max attempts.',
           error_code = 'stale_running',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < NOW() - make_interval(secs => $1)
         AND (attempt_count >= $2 OR expires_at <= NOW())
         AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
       RETURNING id`,
      [staleSeconds, maxAttempts, kinds]
    );

    return {
      requeued: requeuedRows.length,
      failedIds: failedRows.map((row) => row.id),
    };
  });

  for (const jobId of failedIds) {
    await refundChargedAsyncJobIfNeeded(jobId).catch((error) => {
      console.error(`[async-jobs] reaper refund failed for ${jobId}:`, error);
    });
  }

  return { requeued, failed: failedIds.length };
}

/** Refund a charged job that already reached a terminal failed state. */
export async function refundChargedAsyncJobIfNeeded(jobId: string): Promise<boolean> {
  const job = await getAsyncJobById(jobId);
  if (!job || job.billing_state !== "charged" || !job.charge_transaction_id) {
    return false;
  }
  const { rows } = await query<{ amount: number; action_type: string | null }>(
    `SELECT ABS(amount) AS amount, action_type
     FROM rune_transactions
     WHERE id = $1 AND user_id = $2 AND amount < 0
     LIMIT 1`,
    [job.charge_transaction_id, job.user_id]
  );
  const ledger = rows[0];
  if (!ledger || ledger.amount <= 0) return false;
  await BillingService.rollbackCharge({
    userId: job.user_id,
    cost: ledger.amount,
    wasFreeQuestion: false,
    transactionId: job.charge_transaction_id,
    actionType: ledger.action_type ?? undefined,
  });
  await markAsyncJobRefunded(jobId);
  return true;
}

export async function markAsyncJobRunning(jobId: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET status = 'running', locked_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [jobId]
  );
  return rowCount === 1;
}

export async function markAsyncJobCharged(
  jobId: string,
  chargeTransactionId: string
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET billing_state = CASE
           WHEN billing_state IN ('refunded', 'completed') THEN billing_state
           ELSE 'charged'
         END,
         charge_transaction_id = COALESCE(charge_transaction_id, $2),
         updated_at = NOW()
     WHERE id = $1
       AND status IN ('pending', 'running')`,
    [jobId, chargeTransactionId]
  );
}

export async function markAsyncJobRefunded(jobId: string): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET billing_state = 'refunded',
         updated_at = NOW()
     WHERE id = $1
       AND billing_state IN ('unbilled', 'charged')`,
    [jobId]
  );
}

/**
 * Idempotent complete: accepts running, or a false-negative timeout failure
 * so a late route success can still win.
 */
export async function completeAsyncJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET status = 'completed',
         result = $2::jsonb,
         error_message = NULL,
         error_code = NULL,
         billing_state = CASE
           WHEN billing_state = 'refunded' THEN 'refunded'
           ELSE 'completed'
         END,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND (
         status = 'running'
         OR (status = 'failed' AND error_code IN ('worker_timeout', 'stale_running'))
       )`,
    [jobId, JSON.stringify(result)]
  );
}

export async function failAsyncJob(
  jobId: string,
  message: string,
  errorCode = "generation_failed"
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET status = 'failed',
         error_message = $2,
         error_code = $3,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND status = 'running'`,
    [jobId, message.slice(0, 2000), errorCode.slice(0, 100)]
  );
}

/**
 * Fail a still-running job and refund if it was charged but not yet refunded/completed.
 * Used by the worker after timeout reconciliation.
 */
export async function failAsyncJobAndRefundIfCharged(
  jobId: string,
  message: string,
  errorCode = "worker_timeout"
): Promise<{ failed: boolean; refunded: boolean }> {
  const job = await getAsyncJobById(jobId);
  if (!job || job.status !== "running") {
    return { failed: false, refunded: job?.billing_state === "refunded" };
  }

  let refunded = job.billing_state === "refunded";
  if (job.billing_state === "charged" && job.charge_transaction_id) {
    try {
      refunded = (await refundChargedAsyncJobIfNeeded(jobId)) || refunded;
    } catch (error) {
      console.error(`[async-jobs] refund failed for job ${jobId}:`, error);
    }
  }

  const latest = await getAsyncJobById(jobId);
  const chargedUnresolved = latest?.billing_state === "charged";
  await failAsyncJob(
    jobId,
    chargedUnresolved
      ? `${message} Проверьте баланс — автоматический возврат мог не пройти.`
      : message,
    errorCode
  );
  return { failed: true, refunded: latest?.billing_state === "refunded" || refunded };
}

export function scheduleAsyncJob(jobId: string, runner: () => Promise<void>): void {
  setImmediate(() => {
    void runner().catch((err) => {
      console.error(`async job ${jobId} crashed:`, err);
      void failAsyncJob(jobId, err instanceof Error ? err.message : "Job crashed");
    });
  });
}

export function asyncJobPollPayload(job: AsyncJobRow) {
  const refunded = job.billing_state === "refunded";
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    result: job.status === "completed" ? job.result : undefined,
    error: job.status === "failed" ? job.error_message : undefined,
    billingState: job.billing_state,
    refunded,
    createdAt: job.created_at.toISOString(),
    completedAt: job.completed_at?.toISOString() ?? null,
    attempts: job.attempt_count,
  };
}
