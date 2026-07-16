import { query, withTransaction } from "@/lib/db";

export type AsyncJobKind =
  | "reading"
  | "image_generate"
  | "natal_interpretation"
  | "natal_forecast"
  | "natal_compatibility";
export type AsyncJobStatus = "pending" | "running" | "completed" | "failed";

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
  billing_state: "unbilled" | "charged" | "refunded" | "completed";
};

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

export async function getAsyncJobForUser(
  jobId: string,
  userId: string
): Promise<AsyncJobRow | null> {
  const { rows } = await query<AsyncJobRow>(
    `SELECT id, user_id, kind, status, input, result, error_message,
            created_at, updated_at, completed_at, expires_at,
            locked_at, worker_id, attempt_count, period_metadata, error_code, billing_state
     FROM async_jobs
     WHERE id = $1 AND user_id = $2`,
    [jobId, userId]
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
                 jobs.attempt_count, jobs.period_metadata, jobs.error_code, jobs.billing_state`,
       [limit, kinds, input.workerId]
    );
    return rows;
  });
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

export async function completeAsyncJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET status = 'completed',
         result = $2::jsonb,
         error_message = NULL,
         billing_state = 'completed',
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND status = 'running'`,
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

export function scheduleAsyncJob(jobId: string, runner: () => Promise<void>): void {
  setImmediate(() => {
    void runner().catch((err) => {
      console.error(`async job ${jobId} crashed:`, err);
      void failAsyncJob(jobId, err instanceof Error ? err.message : "Job crashed");
    });
  });
}

export function asyncJobPollPayload(job: AsyncJobRow) {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    result: job.status === "completed" ? job.result : undefined,
    error: job.status === "failed" ? job.error_message : undefined,
    createdAt: job.created_at.toISOString(),
    completedAt: job.completed_at?.toISOString() ?? null,
    attempts: job.attempt_count,
  };
}
