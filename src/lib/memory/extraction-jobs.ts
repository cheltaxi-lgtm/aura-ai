/**
 * Durable outbox for background fact extraction (survives process restart).
 * One user turn ⇒ one job. Soft-dedupe only collapses identical pending spam.
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

  const message = userMessage.slice(0, 4000);
  const assistantReply = params.assistantReply?.trim()?.slice(0, 2000) ?? null;

  // Soft-dedupe identical pending spam (double-clicks), not distinct turns.
  const { rows: pending } = await query<{ id: string }>(
    `SELECT id FROM memory_extraction_jobs
      WHERE user_id = $1
        AND source_type = $2
        AND status = 'pending'
        AND user_message = $3
        AND created_at > NOW() - INTERVAL '5 minutes'
      LIMIT 1`,
    [params.userId, params.sourceType, message]
  );
  if (pending[0]?.id) return pending[0].id;

  try {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO memory_extraction_jobs (
         user_id, source_type, source_entity_id, character_id, user_message, assistant_reply
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        params.userId,
        params.sourceType,
        params.sourceEntityId ?? null,
        params.characterId ?? null,
        message,
        assistantReply,
      ]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    // Race against pending unique index — return existing pending twin.
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM memory_extraction_jobs
        WHERE user_id = $1
          AND source_type = $2
          AND status = 'pending'
          AND md5(user_message) = md5($3::text)
        ORDER BY created_at DESC
        LIMIT 1`,
      [params.userId, params.sourceType, message]
    );
    if (rows[0]?.id) return rows[0].id;
    throw err;
  }
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
