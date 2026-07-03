import { query } from "@/lib/db";

export type AsyncJobKind = "reading" | "image_generate";
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
};

export async function createAsyncJob(input: {
  userId: string;
  kind: AsyncJobKind;
  payload: Record<string, unknown>;
}): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO async_jobs (user_id, kind, input)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [input.userId, input.kind, JSON.stringify(input.payload)]
  );
  return rows[0]!.id;
}

export async function getAsyncJobForUser(
  jobId: string,
  userId: string
): Promise<AsyncJobRow | null> {
  const { rows } = await query<AsyncJobRow>(
    `SELECT id, user_id, kind, status, input, result, error_message,
            created_at, updated_at, completed_at, expires_at
     FROM async_jobs
     WHERE id = $1 AND user_id = $2`,
    [jobId, userId]
  );
  return rows[0] ?? null;
}

export async function markAsyncJobRunning(jobId: string): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET status = 'running', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [jobId]
  );
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
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, JSON.stringify(result)]
  );
}

export async function failAsyncJob(jobId: string, message: string): Promise<void> {
  await query(
    `UPDATE async_jobs
     SET status = 'failed',
         error_message = $2,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [jobId, message.slice(0, 2000)]
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
  };
}
