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
  | "hd_composite_report"
  | "pro_premium_report";
export type AsyncJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "needs_regeneration";
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
  started_at: Date | null;
  queue_wait_ms: number | null;
  generation_ms: number | null;
  llm_calls: number | null;
  llm_cost_rub: number | null;
  retry_429_count: number;
  progress: Record<string, unknown>;
};

const JOB_SELECT = `id, user_id, kind, status, input, result, error_message,
            created_at, updated_at, completed_at, expires_at,
            locked_at, worker_id, attempt_count, period_metadata, error_code,
            billing_state, charge_transaction_id,
            dedupe_key, action_type, output_entity_id, output_entity_table,
            provenance, next_attempt_at,
            started_at, queue_wait_ms, generation_ms, llm_calls, llm_cost_rub,
            retry_429_count, progress`;

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

/**
 * Drop save_claimed after a failed persist so timeout/reaper can terminalize
 * refunded+running orphans (handler crashed after claim, before failAsyncJob).
 */
export async function releaseAsyncJobSaveClaim(jobId: string): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET period_metadata = COALESCE(period_metadata, '{}'::jsonb) - 'save_claimed',
         updated_at = NOW()
     WHERE id = $1 AND status = 'running'`,
    [jobId]
  );
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
           started_at = NOW(),
           generation_ms = NULL,
           queue_wait_ms = COALESCE(
             jobs.queue_wait_ms,
             GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - jobs.created_at)) * 1000))::int
           ),
           attempt_count = jobs.attempt_count + 1,
           next_attempt_at = NULL,
           updated_at = NOW()
       FROM candidates
       WHERE jobs.id = candidates.id
       RETURNING jobs.*`,
      [limit, kinds, input.workerId]
    );
    return rows;
  });
}

/** Soft-reschedule a running job after provider 429 / transient outage (no fail, no refund). */
export async function rescheduleAsyncJob(
  jobId: string,
  delayMs: number,
  message?: string
): Promise<boolean> {
  const wait = Math.max(1_000, Math.min(delayMs, 15 * 60_000));
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET status = 'pending',
         worker_id = NULL,
         locked_at = NULL,
         next_attempt_at = NOW() + make_interval(secs => $2),
         retry_429_count = COALESCE(retry_429_count, 0) + 1,
         error_message = COALESCE($3, error_message),
         expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'),
         updated_at = NOW()
     WHERE id = $1 AND status = 'running'`,
    [jobId, Math.floor(wait / 1000), message?.slice(0, 2000) ?? null]
  );
  return rowCount === 1;
}

export async function updateAsyncJobProgress(
  jobId: string,
  progress: Record<string, unknown>
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET progress = COALESCE(progress, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'running')`,
    [jobId, JSON.stringify(progress)]
  );
}

export async function finalizeAsyncJobMetrics(
  jobId: string,
  metrics: {
    generationMs?: number;
    llmCalls?: number;
    llmCostRub?: number;
  }
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET generation_ms = COALESCE($2, generation_ms),
         llm_calls = COALESCE($3, llm_calls),
         llm_cost_rub = COALESCE($4, llm_cost_rub),
         updated_at = NOW()
     WHERE id = $1`,
    [
      jobId,
      metrics.generationMs ?? null,
      metrics.llmCalls ?? null,
      metrics.llmCostRub ?? null,
    ]
  );
}

/** Queue position (1-based) among pending report-lane jobs, or null if not pending. */
export async function getAsyncJobQueuePosition(jobId: string): Promise<number | null> {
  const { rows } = await query<{ pos: number | null }>(
    `WITH target AS (
       SELECT id, created_at, kind, status
       FROM async_jobs
       WHERE id = $1
     )
     SELECT CASE
       WHEN target.status = 'pending' THEN (
         SELECT COUNT(*)::int + 1
         FROM async_jobs j
         WHERE j.status = 'pending'
           AND j.kind = ANY($2::text[])
           AND (j.created_at < target.created_at
                OR (j.created_at = target.created_at AND j.id <= target.id))
       )
       ELSE NULL
     END AS pos
     FROM target`,
    [
      jobId,
      [
        "hd_report",
        "hd_composite_report",
        "pro_premium_report",
        "numerology_reading",
        "natal_interpretation",
        "natal_forecast",
        "natal_compatibility",
      ],
    ]
  );
  return rows[0]?.pos ?? null;
}

/** Absolute wall-clock cap for a single running attempt (watchdog). */
export const ASYNC_JOB_WATCHDOG_MS_DEFAULT = 25 * 60_000;

/**
 * Requeue jobs left `running` by a dead worker (SIGKILL / deploy restart).
 * Single-host worker: any other worker_id is orphaned after restart.
 * Preserves billing_state=charged — no second spend on resume.
 */
export async function reapOrphanedRunningAsyncJobs(input: {
  currentWorkerId: string;
  /** Ignore brand-new claims (another worker may still be alive). */
  minAgeMs?: number;
  kinds?: AsyncJobKind[];
}): Promise<number> {
  const minAgeMs = Math.max(5_000, input.minAgeMs ?? 90_000);
  const kinds = input.kinds ?? [];
  const ageSeconds = Math.floor(minAgeMs / 1000);
  const { rows } = await query<{ id: string }>(
    `UPDATE async_jobs
     SET status = 'pending',
         worker_id = NULL,
         locked_at = NULL,
         next_attempt_at = NOW(),
         error_code = COALESCE(error_code, 'orphan_requeued'),
         error_message = COALESCE(
           NULLIF(error_message, ''),
           'Воркер перезапущен — задача возвращена в очередь без повторного списания.'
         ),
         period_metadata = COALESCE(period_metadata, '{}'::jsonb)
           || jsonb_build_object('orphan_reaped_at', NOW()::text),
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
 * Requeue/fail jobs whose worker died without a clean handoff.
 * Never steals jobs still owned by `currentWorkerId` — those are covered by
 * heartbeat + watchdog (long HD reports must not be requeued mid-LLM).
 */
export async function reapStaleRunningAsyncJobs(input?: {
  staleAfterMs?: number;
  maxAttempts?: number;
  kinds?: AsyncJobKind[];
  /** Required: exclude this worker's live in-flight report jobs. */
  currentWorkerId?: string;
}): Promise<{ requeued: number; failed: number }> {
  const staleAfterMs = Math.max(60_000, input?.staleAfterMs ?? 4 * 60_000);
  const maxAttempts = Math.max(1, input?.maxAttempts ?? 3);
  const kinds = input?.kinds ?? [];
  const staleSeconds = Math.floor(staleAfterMs / 1000);
  const currentWorkerId = input?.currentWorkerId?.trim() || "";

  const { requeued, failedIds } = await withTransaction(async (client) => {
    const { rows: requeuedRows } = await client.query<{ id: string }>(
      `UPDATE async_jobs
       SET status = 'pending',
           worker_id = NULL,
           locked_at = NULL,
           next_attempt_at = NOW(),
           error_code = COALESCE(error_code, 'stale_requeued'),
           error_message = COALESCE(
             NULLIF(error_message, ''),
             'Задача зависла без воркера — возвращена в очередь без повторного списания.'
           ),
           period_metadata = COALESCE(period_metadata, '{}'::jsonb)
             || jsonb_build_object('stale_reaped_at', NOW()::text),
           updated_at = NOW()
       WHERE status = 'running'
         AND locked_at IS NOT NULL
         AND locked_at < NOW() - make_interval(secs => $1)
         AND attempt_count < $2
         AND expires_at > NOW()
         AND ($4 = '' OR worker_id IS DISTINCT FROM $4)
         AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
       RETURNING id`,
      [staleSeconds, maxAttempts, kinds, currentWorkerId]
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
         AND ($4 = '' OR worker_id IS DISTINCT FROM $4)
         AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
       RETURNING id`,
      [staleSeconds, maxAttempts, kinds, currentWorkerId]
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

/**
 * Watchdog: any job running longer than maxRunningMs is forced back to pending
 * (or failed after maxAttempts). Includes the current worker — frees stuck slots
 * after hard LLM hangs. Does not spend runes again.
 */
export async function reapWatchdogRunningAsyncJobs(input?: {
  maxRunningMs?: number;
  maxAttempts?: number;
  kinds?: AsyncJobKind[];
}): Promise<{ requeued: number; failed: number }> {
  const maxRunningMs = Math.max(
    5 * 60_000,
    input?.maxRunningMs ?? ASYNC_JOB_WATCHDOG_MS_DEFAULT
  );
  const maxAttempts = Math.max(1, input?.maxAttempts ?? 5);
  const kinds = input?.kinds ?? [];
  const ageSeconds = Math.floor(maxRunningMs / 1000);

  const { requeued, failedIds } = await withTransaction(async (client) => {
    const { rows: requeuedRows } = await client.query<{ id: string }>(
      `UPDATE async_jobs
       SET status = 'pending',
           worker_id = NULL,
           locked_at = NULL,
           next_attempt_at = NOW() + interval '5 seconds',
           error_code = 'watchdog_requeued',
           error_message = $4,
           period_metadata = COALESCE(period_metadata, '{}'::jsonb)
             || jsonb_build_object('watchdog_reaped_at', NOW()::text),
           updated_at = NOW()
       WHERE status = 'running'
         AND COALESCE(started_at, locked_at, created_at) < NOW() - make_interval(secs => $1)
         AND attempt_count < $2
         AND expires_at > NOW()
         AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
       RETURNING id`,
      [
        ageSeconds,
        maxAttempts,
        kinds,
        `Watchdog: генерация дольше ${Math.round(maxRunningMs / 60000)} мин — задача возвращена в очередь без повторного списания.`,
      ]
    );

    const { rows: failedRows } = await client.query<{ id: string }>(
      `UPDATE async_jobs
       SET status = 'failed',
           error_code = 'watchdog_timeout',
           error_message = $4,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE status = 'running'
         AND COALESCE(started_at, locked_at, created_at) < NOW() - make_interval(secs => $1)
         AND (attempt_count >= $2 OR expires_at <= NOW())
         AND (cardinality($3::text[]) = 0 OR kind = ANY($3::text[]))
       RETURNING id`,
      [
        ageSeconds,
        maxAttempts,
        kinds,
        `Watchdog: превышен лимит попыток после ${Math.round(maxRunningMs / 60000)} мин.`,
      ]
    );

    return {
      requeued: requeuedRows.length,
      failedIds: failedRows.map((row) => row.id),
    };
  });

  for (const jobId of failedIds) {
    await refundChargedAsyncJobIfNeeded(jobId).catch((error) => {
      console.error(`[async-jobs] watchdog refund failed for ${jobId}:`, error);
    });
  }

  return { requeued, failed: failedIds.length };
}

/** Keep locked_at fresh so orphan reaper does not treat a live long job as dead. */
export async function touchAsyncJobHeartbeat(
  jobId: string,
  workerId: string
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET locked_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'running' AND worker_id = $2`,
    [jobId, workerId]
  );
}

/** Count recent watchdog requeues for admin alerts. */
export async function countRecentWatchdogReaps(withinHours = 1): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM async_jobs
     WHERE period_metadata ? 'watchdog_reaped_at'
       AND updated_at > NOW() - make_interval(hours => $1)`,
    [Math.max(1, withinHours)]
  );
  return Number(rows[0]?.n ?? 0);
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
 * Complete while still running.
 * Allows billing_state=refunded so already_saved / duplicate-charge rollback can
 * still deliver the existing report (status→completed, billing stays refunded).
 * Never re-open a failed/refunded job.
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
         billing_state = CASE
           WHEN billing_state = 'refunded' THEN 'refunded'
           ELSE 'completed'
         END,
         completed_at = NOW(),
         updated_at = NOW(),
         worker_id = NULL,
         locked_at = NULL
     WHERE id = $1
       AND status = 'running'
       AND billing_state IN ('unbilled', 'charged', 'refunded')`,
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

/** Park a generated report for manual/quality regeneration without refunding it. */
/**
 * Quality-gate failure policy: one automatic regeneration without charging
 * (billing stays as-is; sync routes skip the charge for already-charged jobs),
 * then fail + refund — the user must not pay for a report that never passed QA.
 */
export async function retryNeedsRegenerationOnce(
  jobId: string,
  message: string
): Promise<"requeued" | "failed"> {
  const { rows } = await query<{ regen_attempts: number }>(
    `SELECT COALESCE((period_metadata->>'regen_attempts')::int, 0) AS regen_attempts
     FROM async_jobs
     WHERE id = $1 AND status = 'running'`,
    [jobId]
  );
  const attempts = rows[0]?.regen_attempts ?? 0;
  if (attempts >= 1) {
    await failAsyncJobAndRefundIfCharged(jobId, message, "regeneration_failed");
    return "failed";
  }
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET status = 'pending',
         locked_at = NULL,
         worker_id = NULL,
         next_attempt_at = NOW() + INTERVAL '15 seconds',
         expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'),
         period_metadata = jsonb_set(
           COALESCE(period_metadata, '{}'::jsonb), '{regen_attempts}', '1'::jsonb
         ),
         updated_at = NOW()
     WHERE id = $1 AND status = 'running'`,
    [jobId]
  );
  if (rowCount === 1) return "requeued";
  await markAsyncJobNeedsRegeneration(jobId, message);
  return "failed";
}

export async function markAsyncJobNeedsRegeneration(
  jobId: string,
  message: string
): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET status = 'needs_regeneration',
         error_message = $2,
         error_code = 'needs_regeneration',
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
       AND status = 'running'
       AND billing_state IN ('unbilled', 'charged')`,
    [jobId, message.slice(0, 2000)]
  );
  return rowCount === 1;
}

/** Max total claims for a report job before terminal failure (model variance). */
export const REPORT_JOB_MAX_ATTEMPTS = 3;
/** Max provider-outage reschedules — survives ~15 min of OpenRouter flapping. */
export const REPORT_JOB_MAX_PROVIDER_RESCHEDULES = 8;

/**
 * Failure codes that justify an automatic retry for heavy report jobs:
 * provider/network wobble, model-variance quality failures, DB statement
 * timeouts. Client/data errors (insufficient, not_found, …) stay terminal.
 */
const RETRYABLE_REPORT_ERROR_CODES = new Set([
  "generation_failed",
  "invalid_model_report",
  "invalid_model_output",
  "empty_or_rejected",
  "matrix_arcana_mismatch",
  "db_timeout",
  "provider_unavailable",
  "worker_timeout",
]);

export function isRetryableReportErrorCode(code: string | null | undefined): boolean {
  return Boolean(code) && RETRYABLE_REPORT_ERROR_CODES.has(code as string);
}

/**
 * Retry budget for heavy report jobs: requeue (billing untouched — the retry
 * reuses the existing charge) while under the attempt budget, then fail +
 * refund. Never use for client errors — only transient/model-variance codes.
 */
export async function retryOrFailReportJob(input: {
  jobId: string;
  message: string;
  errorCode: string;
  delayMs?: number;
  maxAttempts?: number;
}): Promise<"requeued" | "failed"> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? REPORT_JOB_MAX_ATTEMPTS);
  const { rows } = await query<{ attempt_count: number }>(
    `SELECT attempt_count FROM async_jobs WHERE id = $1 AND status = 'running'`,
    [input.jobId]
  );
  const attemptCount = rows[0]?.attempt_count;
  // Already transitioned elsewhere (reaped / completed) — do not interfere.
  if (attemptCount === undefined) return "failed";
  if (attemptCount < maxAttempts) {
    const wait = Math.max(5_000, Math.min(input.delayMs ?? 30_000, 15 * 60_000));
    const { rowCount } = await query(
      `UPDATE async_jobs
       SET status = 'pending',
           worker_id = NULL,
           locked_at = NULL,
           next_attempt_at = NOW() + make_interval(secs => $2),
           error_message = $3,
           error_code = $4,
           expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'),
           updated_at = NOW()
       WHERE id = $1 AND status = 'running'`,
      [
        input.jobId,
        Math.floor(wait / 1000),
        input.message.slice(0, 2000),
        input.errorCode.slice(0, 100),
      ]
    );
    // Lost the race with reaper/complete — treat as handled elsewhere.
    return rowCount === 1 ? "requeued" : "failed";
  }
  await failAsyncJobAndRefundIfCharged(input.jobId, input.message, input.errorCode);
  return "failed";
}

/**
 * Provider-outage reschedule with a hard cap. rescheduleAsyncJob alone loops
 * forever on a deterministic network failure (retry_429_count had no ceiling),
 * which is exactly the «отчёт висит вечно» bug.
 */
export async function rescheduleOrFailReportJob(input: {
  jobId: string;
  delayMs: number;
  message: string;
  maxReschedules?: number;
}): Promise<"requeued" | "failed"> {
  const cap = Math.max(1, input.maxReschedules ?? REPORT_JOB_MAX_PROVIDER_RESCHEDULES);
  const { rows } = await query<{ retry_429_count: number }>(
    `SELECT retry_429_count FROM async_jobs WHERE id = $1 AND status = 'running'`,
    [input.jobId]
  );
  const count = rows[0]?.retry_429_count;
  if (count === undefined) return "failed";
  if (count >= cap) {
    await failAsyncJobAndRefundIfCharged(input.jobId, input.message, "provider_unavailable");
    return "failed";
  }
  const ok = await rescheduleAsyncJob(input.jobId, input.delayMs, input.message);
  return ok ? "requeued" : "failed";
}

/**
 * Sweep parked needs_regeneration jobs and apply the retry-once policy.
 * Routes self-mark needs_regeneration via trackWorkerJobNeedsRegeneration, so
 * by the time the worker learns the code the job is no longer 'running' and
 * retryNeedsRegenerationOnce cannot fire — this reaper is what actually makes
 * the auto-retry happen (and heals jobs parked before the policy existed).
 */
export async function reapNeedsRegenerationAsyncJobs(input: {
  minAgeMs: number;
  kinds: AsyncJobKind[];
  limit?: number;
}): Promise<{ requeued: number; failed: number }> {
  const { rows } = await query<{
    id: string;
    error_message: string | null;
    regen_attempts: number;
  }>(
    `SELECT id, error_message,
            COALESCE((period_metadata->>'regen_attempts')::int, 0) AS regen_attempts
     FROM async_jobs
     WHERE status = 'needs_regeneration'
       AND kind = ANY($2)
       AND updated_at < NOW() - make_interval(secs => $1)
     ORDER BY updated_at
     LIMIT $3`,
    [Math.floor(input.minAgeMs / 1000), input.kinds, input.limit ?? 10]
  );
  let requeued = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.regen_attempts < 1) {
      const { rowCount } = await query(
        `UPDATE async_jobs
         SET status = 'pending',
             locked_at = NULL,
             worker_id = NULL,
             completed_at = NULL,
             next_attempt_at = NOW() + INTERVAL '15 seconds',
             expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours'),
             period_metadata = jsonb_set(
               COALESCE(period_metadata, '{}'::jsonb), '{regen_attempts}', '1'::jsonb
             ),
             updated_at = NOW()
         WHERE id = $1 AND status = 'needs_regeneration'`,
        [row.id]
      );
      if (rowCount === 1) requeued += 1;
      continue;
    }
    const { rowCount } = await query(
      `UPDATE async_jobs
       SET status = 'failed',
           error_code = 'regeneration_failed',
           error_message = $2,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'needs_regeneration'`,
      [
        row.id,
        (row.error_message ?? "Разбор требует проверки качества.").slice(0, 2000),
      ]
    );
    if (rowCount !== 1) continue;
    failed += 1;
    const latest = await getAsyncJobById(row.id);
    if (latest?.billing_state === "charged" && latest.charge_transaction_id) {
      try {
        await refundChargedAsyncJobIfNeeded(row.id);
      } catch (error) {
        console.error(
          `[async-jobs] refund failed for needs_regeneration job ${row.id}:`,
          error
        );
      }
    }
  }
  return { requeued, failed };
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

/**
 * Heavy report jobs for the user-facing "мои отчёты" surface: active plus
 * recently terminal (24h) so a finished report does not vanish from the UI
 * before the user sees the ready state. Terminal rows the user cleared from
 * the tray (period_metadata.tray_dismissed_at) stay hidden.
 */
export async function listReportJobsForUser(
  userId: string,
  kinds: AsyncJobKind[]
): Promise<AsyncJobRow[]> {
  if (!kinds.length) return [];
  const { rows } = await query<AsyncJobRow>(
    `SELECT ${JOB_SELECT}
     FROM async_jobs
     WHERE user_id = $1
       AND kind = ANY($2::text[])
       AND (
         (status IN ('pending', 'running') AND expires_at > NOW())
         OR (status IN ('completed', 'failed', 'needs_regeneration')
             AND COALESCE(completed_at, updated_at) > NOW() - INTERVAL '24 hours'
             AND NOT (period_metadata ? 'tray_dismissed_at'))
       )
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId, kinds]
  );
  return rows;
}

/**
 * Hide terminal report jobs from the tray / feed without deleting them.
 * Active (pending/running) jobs are never dismissed — only completed/failed/
 * needs_regeneration. Pass jobIds, or omit to clear all recent terminal ones.
 */
export async function dismissReportJobsTrayForUser(
  userId: string,
  kinds: AsyncJobKind[],
  jobIds?: string[]
): Promise<number> {
  if (!kinds.length) return 0;
  const ids = (jobIds ?? []).filter((id) => typeof id === "string" && id.length > 0);
  const { rowCount } = await query(
    `UPDATE async_jobs
     SET period_metadata = COALESCE(period_metadata, '{}'::jsonb)
           || jsonb_build_object('tray_dismissed_at', NOW()::text),
         updated_at = NOW()
     WHERE user_id = $1
       AND kind = ANY($2::text[])
       AND status IN ('completed', 'failed', 'needs_regeneration')
       AND COALESCE(completed_at, updated_at) > NOW() - INTERVAL '24 hours'
       AND NOT (period_metadata ? 'tray_dismissed_at')
       AND (cardinality($3::uuid[]) = 0 OR id = ANY($3::uuid[]))`,
    [userId, kinds, ids]
  );
  return rowCount ?? 0;
}

export function asyncJobPollPayload(job: AsyncJobRow) {
  const refunded = job.billing_state === "refunded";
  const meta = job.period_metadata ?? {};
  const metaProgress = meta.progress;
  const columnProgress = job.progress;
  const progressRaw =
    columnProgress && typeof columnProgress === "object" && Object.keys(columnProgress).length
      ? columnProgress
      : metaProgress;
  const progress =
    progressRaw && typeof progressRaw === "object" && !Array.isArray(progressRaw)
      ? (progressRaw as Record<string, unknown>)
      : undefined;
  const providerPaused =
    typeof progress?.providerPaused === "boolean" ? progress.providerPaused : undefined;
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    result: job.status === "completed" ? job.result : undefined,
    error:
      job.status === "failed" || job.status === "needs_regeneration"
        ? job.error_message
        : undefined,
    billingState: job.billing_state,
    refunded,
    createdAt: job.created_at.toISOString(),
    completedAt: job.completed_at?.toISOString() ?? null,
    /** Worker liveness: locked_at is refreshed by heartbeat during in-process runs. */
    heartbeatAt: (job.locked_at ?? job.updated_at).toISOString(),
    startedAt: job.started_at?.toISOString() ?? null,
    attempts: job.attempt_count,
    outputEntityId: job.output_entity_id,
    outputEntityTable: job.output_entity_table,
    provenance: job.provenance,
    dedupeKey: job.dedupe_key || undefined,
    queueWaitMs: job.queue_wait_ms,
    generationMs: job.generation_ms,
    retry429Count: job.retry_429_count,
    nextAttemptAt: job.next_attempt_at?.toISOString() ?? null,
    providerPaused,
    progress: progress
      ? {
          done: typeof progress.done === "number" ? progress.done : undefined,
          total: typeof progress.total === "number" ? progress.total : undefined,
          label: typeof progress.label === "string" ? progress.label : undefined,
          message:
            typeof progress.message === "string" ? progress.message : undefined,
          stage: typeof progress.stage === "string" ? progress.stage : undefined,
          queuePosition:
            typeof progress.queuePosition === "number"
              ? progress.queuePosition
              : undefined,
        }
      : undefined,
  };
}
