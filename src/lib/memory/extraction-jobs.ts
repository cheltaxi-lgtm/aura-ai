/**
 * Durable outbox for background fact extraction (survives process restart).
 * One user turn ⇒ one job. Soft-dedupe only collapses identical pending spam.
 */
import type { FactInput } from "@/lib/memory/user-facts";
import { query, queryClient } from "@/lib/db";
import { canAutoCapture } from "@/lib/memory/preferences";
import { readMemoryWriteConsent, withUserMemoryLock } from "@/lib/memory/write-guard";

export type MemoryExtractionResult = { facts: FactInput[]; parsedCount: number; groundingRejectedCount: number };

export type MemoryExtractionJob = {
  extractionResult: MemoryExtractionResult | null;
  id: string;
  userId: string;
  sourceType: string;
  sourceEntityId: string | null;
  characterId: string | null;
  userMessage: string;
  assistantReply: string | null;
  status: string;
  attempts: number;
  claimToken: string;
  captureGeneration: string;
};

type JobRow = {
  extraction_result: MemoryExtractionResult | null;
  id: string;
  user_id: string;
  source_type: string;
  source_entity_id: string | null;
  character_id: string | null;
  user_message: string;
  assistant_reply: string | null;
  status: string;
  attempts: number;
  claim_token: string;
  capture_generation: string;
};

function mapJob(row: JobRow): MemoryExtractionJob {
  return {
    extractionResult: row.extraction_result ?? null,
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceEntityId: row.source_entity_id,
    characterId: row.character_id,
    userMessage: row.user_message,
    assistantReply: row.assistant_reply,
    status: row.status,
    attempts: row.attempts,
    claimToken: row.claim_token,
    captureGeneration: String(row.capture_generation),
  };
}

export async function enqueueMemoryExtraction(params: {
  captureGeneration?: string | null;
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

  return withUserMemoryLock(params.userId, async (client) => {
  const consent = await readMemoryWriteConsent(params.userId, client);
  if (!consent?.memoryEnabled || !consent.autoCaptureEnabled) return null;
  if (params.captureGeneration !== undefined && params.captureGeneration !== consent.generation) return null;

  const message = userMessage.slice(0, 4000);
  const assistantReply = params.assistantReply?.trim()?.slice(0, 2000) ?? null;

  // Soft-dedupe identical pending spam (double-clicks), not distinct turns.
  const { rows: pending } = await queryClient<{ id: string }>(client,
    `SELECT id FROM memory_extraction_jobs
      WHERE user_id = $1
        AND source_type = $2
        AND status = 'pending'
        AND user_message = $3
        AND capture_generation = $4::bigint
        AND created_at > NOW() - INTERVAL '5 minutes'
      LIMIT 1`,
    [params.userId, params.sourceType, message, consent.generation]
  );
  if (pending[0]?.id) return pending[0].id;

    // Retire an old pending twin before the partial unique index can block this generation.
    await queryClient(client, `UPDATE memory_extraction_jobs SET status = 'cancelled', completed_at = NOW()
      WHERE user_id = $1 AND source_type = $2 AND status = 'pending' AND md5(user_message) = md5($3::text)
        AND capture_generation <> $4::bigint`, [params.userId, params.sourceType, message, consent.generation]);
    const { rows } = await queryClient<{ id: string }>(client,
      `INSERT INTO memory_extraction_jobs (
         user_id, source_type, source_entity_id, character_id, user_message, assistant_reply, capture_generation
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::bigint)
       ON CONFLICT (user_id, source_type, md5(user_message)) WHERE status = 'pending'
       DO UPDATE SET user_message = EXCLUDED.user_message
       RETURNING id`,
      [
        params.userId,
        params.sourceType,
        params.sourceEntityId ?? null,
        params.characterId ?? null,
        message,
        assistantReply,
        consent.generation,
      ]
    );
    return rows[0]?.id ?? null;
  });
}

export async function claimMemoryExtractionJobs(
  limit = 10,
  userId?: string
): Promise<MemoryExtractionJob[]> {
  // Crashed fifth attempts terminate rather than staying running forever.
  await query(`UPDATE memory_extraction_jobs SET status = 'failed', completed_at = NOW(),
      claim_token = NULL, last_error = 'extraction_lease_expired'
    WHERE status = 'running' AND attempts >= 5
      AND COALESCE(claimed_at, created_at) < NOW() - INTERVAL '10 minutes'
      AND ($1::uuid IS NULL OR user_id = $1::uuid)`, [userId ?? null]);
  const { rows } = await query<JobRow>(
    `WITH claimed AS (
       SELECT id FROM memory_extraction_jobs
        WHERE ((status = 'pending' AND next_attempt_at <= NOW())
          OR (status = 'running' AND COALESCE(claimed_at, created_at) < NOW() - INTERVAL '10 minutes'))
          AND attempts < 5
          AND ($2::uuid IS NULL OR user_id = $2::uuid)
        ORDER BY next_attempt_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE memory_extraction_jobs j
        SET status = 'running',
            claimed_at = NOW(), claim_token = gen_random_uuid(),
            attempts = attempts + 1
       FROM claimed
      WHERE j.id = claimed.id
      RETURNING j.*`,
    [Math.min(50, Math.max(1, Math.floor(limit))), userId ?? null]
  );
  return rows.map(mapJob);
}

export async function completeMemoryExtractionJob(
  jobId: string,
  claimToken: string,
  metrics?: {
    extractedCount?: number;
    storedCount?: number;
    groundingRejectedCount?: number;
  }
): Promise<void> {
  await query(
    `UPDATE memory_extraction_jobs
        SET status = 'completed',
            completed_at = NOW(),
            last_error = NULL,
            extracted_count = $2,
            stored_count = GREATEST($3, (SELECT COUNT(*) FROM memory_extraction_fact_writes WHERE job_id=$1)),
            grounding_rejected_count = $4
      WHERE id = $1 AND claim_token = $5::uuid AND status = 'running'
        AND claimed_at > NOW() - INTERVAL '10 minutes'`,
    [
      jobId,
      metrics?.extractedCount ?? 0,
      metrics?.storedCount ?? 0,
      metrics?.groundingRejectedCount ?? 0,
      claimToken,
    ]
  );
}

/** Persist the extracted batch before applying any fact, so retries never ask the LLM to paraphrase it. */
export async function saveMemoryExtractionResult(jobId: string, claimToken: string, result: MemoryExtractionResult): Promise<boolean> {
  const saved = await query(`UPDATE memory_extraction_jobs SET extraction_result=$3::jsonb
    WHERE id=$1 AND claim_token=$2::uuid AND status='running' AND extraction_result IS NULL
      AND claimed_at > NOW()-INTERVAL '10 minutes'`, [jobId, claimToken, JSON.stringify(result)]);
  return Boolean(saved.rowCount);
}

export async function failMemoryExtractionJob(jobId: string, error: string, claimToken: string): Promise<void> {
  await query(
    `UPDATE memory_extraction_jobs
        SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'running' END,
            next_attempt_at = NOW() + (LEAST(attempts, 5) * INTERVAL '2 minutes'),
            claimed_at = NOW() - INTERVAL '10 minutes' + (LEAST(attempts, 5) * INTERVAL '2 minutes'),
            claim_token = NULL,
            last_error = $2
      WHERE id = $1 AND claim_token = $3::uuid AND status = 'running'`,
    [jobId, error.slice(0, 500), claimToken]
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
