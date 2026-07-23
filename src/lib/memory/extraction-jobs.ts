/**
 * Durable outbox for background fact extraction (survives process restart).
 */
import { query } from "@/lib/db";
import { canAutoCapture } from "@/lib/memory/preferences";

export type MemoryExtractionJob = {
  id: string;
  userId: string;
  sourceType: string;
  sourceEntityId: string | null;
  characterId: string | null;
  userMessage: string;
  assistantReply: string | null;
  status: string;
  attempts: number;
};

type JobRow = {
  id: string;
  user_id: string;
  source_type: string;
  source_entity_id: string | null;
  character_id: string | null;
  user_message: string;
  assistant_reply: string | null;
  status: string;
  attempts: number;
};

function mapJob(row: JobRow): MemoryExtractionJob {
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceEntityId: row.source_entity_id,
    characterId: row.character_id,
    userMessage: row.user_message,
    assistantReply: row.assistant_reply,
    status: row.status,
    attempts: row.attempts,
  };
}

export async function enqueueMemoryExtraction(params: {
  userId: string;
  sourceType: string;
  sourceEntityId?: string | null;
  characterId?: string | null;
  userMessage: string;
  assistantReply?: string | null;
}): Promise<string | null> {
  const userMessage = params.userMessage?.trim();
  if (!params.userId || !userMessage) return null;

  const allowed = await canAutoCapture(params.userId);
  if (!allowed) return null;

  const { rows } = await query<{ id: string }>(
    `INSERT INTO memory_extraction_jobs (
       user_id, source_type, source_entity_id, character_id, user_message, assistant_reply
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, source_type, source_entity_id)
       WHERE source_entity_id IS NOT NULL
       DO UPDATE SET
         user_message = EXCLUDED.user_message,
         assistant_reply = EXCLUDED.assistant_reply,
         character_id = COALESCE(EXCLUDED.character_id, memory_extraction_jobs.character_id),
         status = CASE
           WHEN memory_extraction_jobs.status = 'completed' THEN memory_extraction_jobs.status
           ELSE 'pending'
         END,
         next_attempt_at = CASE
           WHEN memory_extraction_jobs.status = 'completed' THEN memory_extraction_jobs.next_attempt_at
           ELSE NOW()
         END,
         last_error = NULL
     RETURNING id`,
    [
      params.userId,
      params.sourceType,
      params.sourceEntityId ?? null,
      params.characterId ?? null,
      userMessage.slice(0, 4000),
      params.assistantReply?.trim()?.slice(0, 2000) ?? null,
    ]
  );
  return rows[0]?.id ?? null;
}

export async function claimMemoryExtractionJobs(limit = 10): Promise<MemoryExtractionJob[]> {
  const { rows } = await query<JobRow>(
    `WITH claimed AS (
       SELECT id FROM memory_extraction_jobs
        WHERE status = 'pending'
          AND next_attempt_at <= NOW()
          AND attempts < 5
        ORDER BY next_attempt_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE memory_extraction_jobs j
        SET status = 'running',
            attempts = attempts + 1
       FROM claimed
      WHERE j.id = claimed.id
      RETURNING j.*`,
    [limit]
  );
  return rows.map(mapJob);
}

export async function completeMemoryExtractionJob(jobId: string): Promise<void> {
  await query(
    `UPDATE memory_extraction_jobs
        SET status = 'completed', completed_at = NOW(), last_error = NULL
      WHERE id = $1`,
    [jobId]
  );
}

export async function failMemoryExtractionJob(jobId: string, error: string): Promise<void> {
  await query(
    `UPDATE memory_extraction_jobs
        SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
            next_attempt_at = NOW() + (LEAST(attempts, 5) * INTERVAL '2 minutes'),
            last_error = $2
      WHERE id = $1`,
    [jobId, error.slice(0, 500)]
  );
}

export async function cancelPendingMemoryJobs(userId: string): Promise<number> {
  const res = await query(
    `UPDATE memory_extraction_jobs
        SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = $1 AND status IN ('pending', 'running')`,
    [userId]
  );
  return res.rowCount ?? 0;
}

export async function purgeMemoryExtractionJobs(userId: string): Promise<number> {
  const res = await query(`DELETE FROM memory_extraction_jobs WHERE user_id = $1`, [userId]);
  return res.rowCount ?? 0;
}
