import { query, withTransaction } from "@/lib/db";
import { BillingService } from "@/lib/services/billing-service";

export type AsyncJobKind =
  | "reading"
  | "image_generate"
  | "natal_interpretation"
  | "natal_forecast"
  | "natal_compatibility"
  | "intention_spread"
  | "daily_reading"
  | "daily_extended"
  | "joint_reading"
  | "joint_combined"
  | "photo_reading"
  | "ritual_generation"
  | "numerology_reading"
  | "hd_report"
  | "hd_composite_report";
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
  dedupe_key: string;
  action_type: string | null;
  output_entity_id: string | null;
  output_entity_table: string | null;
  provenance: Record<string, unknown>;
  next_attempt_at: Date | null;
};

const JOB_SELECT = `id, user_id, kind, status, input, result, error_message,
            created_at, updated_at, completed_at, expires_at,
            locked_at, worker_id, attempt_count, period_metadata, error_code,
            billing_state, charge_transaction_id,
            dedupe_key, action_type, output_entity_id, output_entity_table,
            provenance, next_attempt_at`;

export async function createAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
  periodMetadata?: Record<string, unknown>;
  dedupeKey?: string;
  actionType?: string;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO async_jobs (user_id, kind, input, period_metadata, dedupe_key, action_type)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
     RETURNING id`,
    [
      input.userId,
      input.kind,
      JSON.stringify(input.payload),
      JSON.stringify(input.periodMetadata ?? {}),
      input.dedupeKey ?? "",
      input.actionType ?? null,
    ]
  );
  return rows[0]!.id;
}

/** Return an in-flight job with the same dedupe key (preferred) or payload. */
export async function findActiveAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
  dedupeKey?: string;
}): Promise<string | null> {
  if (input.dedupeKey) {
    const { rows } = await query<{ id: string }>(
      `SELECT id
       FROM async_jobs
       WHERE user_id = $1
         AND kind = $2
         AND status IN ('pending', 'running')
         AND expires_at > NOW()
         AND dedupe_key = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [input.userId, input.kind, input.dedupeKey]
    );
    if (rows[0]?.id) return rows[0].id;
  }
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

/** Cap in-flight natal jobs per user (pending + running). */
export async function countActiveAsyncJobsForUser(input: {
  userId: string;
  kinds: AsyncJobKind[];
}): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM async_jobs
     WHERE user_id = $1
       AND status IN ('pending', 'running')
       AND expires_at > NOW()
       AND kind = ANY($2::text[])`,
    [input.userId, input.kinds]
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Claim exclusive right to persist a paid report for a worker job.
 * Blocks timeout-refund from winning after generation finishes.
 */
export async function claimAsyncJobForSave(jobId: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET period_metadata = period_metadata || '{"save_claimed":true}'::jsonb,
         updated_at = NOW()
     WHERE id = $1
       AND status = 'running'
       AND billing_state IN ('unbilled', 'charged')`,
    [jobId]
  );
  return rowCount === 1;
}

/** Merge progress / UI hints into period_metadata while job is running. */
export async function mergeAsyncJobPeriodMetadata(
  jobId: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (!jobId.trim() || !Object.keys(patch).length) return;
  await query(
    `UPDATE async_jobs
     SET period_metadata = COALESCE(period_metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'running')`,
    [jobId, JSON.stringify(patch)]
  );
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
           AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
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
           next_attempt_at = NULL,
           updated_at = NOW()
       FROM candidates
       WHERE jobs.id = candidates.id
       RETURNING jobs.id, jobs.user_id, jobs.kind, jobs.status, jobs.input,
                 jobs.result, jobs.error_message, jobs.created_at, jobs.updated_at,
                 jobs.completed_at, jobs.expires_at, jobs.locked_at, jobs.worker_id,
                 jobs.attempt_count, jobs.period_metadata, jobs.error_code,
                 jobs.billing_state, jobs.charge_transaction_id,
                 jobs.dedupe_key, jobs.action_type, jobs.output_entity_id,
                 jobs.output_entity_table, jobs.provenance, jobs.next_attempt_at`,
      [limit, kinds, input.workerId]
    );
    return rows;
  });
}

/**
 * Requeue jobs left `running` by a dead worker (SIGKILL / deploy restart).
 * Single-host worker: any other worker_id is orphaned after restart.
 */
export async function reapOrphanedRunningAsyncJobs(input: {
  currentWorkerId: string;
  /** Ignore brand-new claims (another worker may still be alive). */
  minAgeMs?: number;
  kinds?: AsyncJobKind[];
}): Promise<number> {
  const minAgeMs = Math.max(30_000, input.minAgeMs ?? 90_000);
  const kinds = input.kinds ?? [];
  const ageSeconds = Math.floor(minAgeMs / 1000);
  const { rows } = await query<{ id: string }>(
    `UPDATE async_jobs
     SET status = 'pending',
         worker_id = NULL,
         locked_at = NULL,
         updated_at = NOW()
     WHERE status = 'running'
       AND locked_at IS NOT NULL
       AND locked_at < NOW() - make_interval(secs => $1)
       AND worker_id IS DISTINCT FROM $2
       AND expires_at > NOW()
       AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
     RETURNING id`,
    [ageSeconds, input.currentWorkerId, kinds]
  );
  return rows.length;
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
  // Default 4 min — must beat SIGKILL zombies sooner than the old 12 min spinner.
  const staleAfterMs = Math.max(60_000, input?.staleAfterMs ?? 4 * 60_000);
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
 * Complete only while still running and not refunded.
 * Never re-open a failed/refunded job (prevents free report after timeout refund).
 */
export async function completeAsyncJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET status = 'completed',
         result = $2::jsonb,
         error_message = NULL,
         error_code = NULL,
         billing_state = 'completed',
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND status = 'running'
       AND billing_state IN ('unbilled', 'charged')`,
    [jobId, JSON.stringify(result)]
  );
  return rowCount === 1;
}

export async function failAsyncJob(
  jobId: string,
  message: string,
  errorCode = "generation_failed",
  options?: { onlyIfSaveNotClaimed?: boolean }
): Promise<boolean> {
  const saveGuard = options?.onlyIfSaveNotClaimed
    ? `AND COALESCE((period_metadata->>'save_claimed')::boolean, false) = false`
    : "";
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET status = 'failed',
         error_message = $2,
         error_code = $3,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND status = 'running'
       ${saveGuard}`,
    [jobId, message.slice(0, 2000), errorCode.slice(0, 100)]
  );
  return rowCount === 1;
}

/**
 * Fail a still-running job and refund if charged — but never after save_claimed.
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

  // Atomic: lose to save_claimed / complete so we never refund a delivered report.
  const failed = await failAsyncJob(jobId, message, errorCode, {
    onlyIfSaveNotClaimed: true,
  });
  if (!failed) {
    return { failed: false, refunded: false };
  }

  let refunded = false;
  const latest = await getAsyncJobById(jobId);
  if (latest?.billing_state === "charged" && latest.charge_transaction_id) {
    try {
      refunded = await refundChargedAsyncJobIfNeeded(jobId);
    } catch (error) {
      console.error(`[async-jobs] refund failed for job ${jobId}:`, error);
    }
  }

  if (latest?.billing_state === "charged" && !refunded) {
    await query(
      `UPDATE async_jobs
       SET error_message = $2, updated_at = NOW()
       WHERE id = $1 AND status = 'failed'`,
      [
        jobId,
        `${message} Проверьте баланс — автоматический возврат мог не пройти.`.slice(0, 2000),
      ]
    );
  }

  return {
    failed: true,
    refunded: (await getAsyncJobById(jobId))?.billing_state === "refunded" || refunded,
  };
}

export function scheduleAsyncJob(jobId: string, runner: () => Promise<void>): void {
  setImmediate(() => {
    void runner().catch((err) => {
      console.error(`async job ${jobId} crashed:`, err);
      void failAsyncJob(jobId, err instanceof Error ? err.message : "Job crashed");
    });
  });
}

export async function attachAsyncJobOutput(
  jobId: string,
  input: {
    entityTable: string;
    entityId: string;
    provenance?: Record<string, unknown>;
  }
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET output_entity_table = $2,
         output_entity_id = $3::uuid,
         provenance = CASE
           WHEN $4::jsonb = '{}'::jsonb THEN provenance
           ELSE COALESCE(provenance, '{}'::jsonb) || $4::jsonb
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      jobId,
      input.entityTable,
      input.entityId,
      JSON.stringify(input.provenance ?? {}),
    ]
  );
}

export async function listActiveAsyncJobsForUser(
  userId: string,
  kinds?: AsyncJobKind[]
): Promise<AsyncJobRow[]> {
  const { rows } = await query<AsyncJobRow>(
    `SELECT ${JOB_SELECT}
     FROM async_jobs
     WHERE user_id = $1
       AND status IN ('pending', 'running')
       AND expires_at > NOW()
       AND (cardinality($2::text[]) = 0 OR kind = ANY($2::text[]))
     ORDER BY created_at DESC`,
    [userId, kinds ?? []]
  );
  return rows;
}

export function asyncJobPollPayload(job: AsyncJobRow) {
  const refunded = job.billing_state === "refunded";
  const meta = job.period_metadata ?? {};
  const progressRaw = meta.progress;
  const progress =
    progressRaw && typeof progressRaw === "object" && !Array.isArray(progressRaw)
      ? (progressRaw as Record<string, unknown>)
      : undefined;
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
    outputEntityId: job.output_entity_id,
    outputEntityTable: job.output_entity_table,
    provenance: job.provenance,
    dedupeKey: job.dedupe_key || undefined,
    progress: progress
      ? {
          done: typeof progress.done === "number" ? progress.done : undefined,
          total: typeof progress.total === "number" ? progress.total : undefined,
          label: typeof progress.label === "string" ? progress.label : undefined,
          message:
            typeof progress.message === "string" ? progress.message : undefined,
        }
      : undefined,
  };
}
