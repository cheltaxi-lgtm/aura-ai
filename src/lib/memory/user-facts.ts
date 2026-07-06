/**
 * Durable, cross-master client facts stored in our own PostgreSQL (pgvector).
 *
 * Source of truth for long-term semantic memory (replaces Mem0). Facts are
 * embedded with bge-m3 (1024-dim, via OpenRouter) and retrieved by cosine
 * distance, with graceful fallbacks (salience/recency) when embeddings are
 * unavailable.
 *
 * Hygiene: near-duplicate facts are merged on write, and each user is capped
 * to MAX_FACTS_PER_USER (lowest-salience/oldest pruned).
 */
import { query } from "@/lib/db";
import { EMBED_DIM, embedTexts } from "@/lib/memory/embeddings";

export interface UserFact {
  id: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
  sourceCharacter: string | null;
  salience: number;
}

export interface FactInput {
  fact: string;
  category?: string | null;
  eventDate?: string | null;
  sourceCharacter?: string | null;
  salience?: number;
}

/** Cosine distance under which two facts are treated as duplicates (merge). */
const DEDUP_MAX_DISTANCE = 0.18;
/** Cosine distance ceiling for a fact to be considered relevant to a query. */
const SEARCH_MAX_DISTANCE = 0.62;
/** Max facts retained per user; excess is pruned by salience then recency. */
const MAX_FACTS_PER_USER = 300;

type FactRow = {
  id: string;
  fact: string;
  category: string | null;
  event_date: string | null;
  source_character: string | null;
  salience: number;
};

const FACT_COLUMNS = `id, fact, category, event_date::text AS event_date, source_character, salience`;
/** Same columns, table-qualified — for queries that JOIN (avoids ambiguous "id"). */
const FACT_COLUMNS_F = `f.id, f.fact, f.category, f.event_date::text AS event_date, f.source_character, f.salience`;

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function clampSalience(value: number | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value as number)));
}

function mapRow(r: FactRow): UserFact {
  return {
    id: r.id,
    fact: r.fact,
    category: r.category,
    eventDate: r.event_date,
    sourceCharacter: r.source_character,
    salience: r.salience,
  };
}

async function embedOne(text: string, timeoutMs?: number): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const vectors = await embedTexts(trimmed.slice(0, 4000), timeoutMs);
  return vectors?.[0] ?? null;
}

/** Short timeout for the user-facing read path so chat never stalls. */
const SEARCH_EMBED_TIMEOUT_MS = 2500;

/** Keep only the top MAX_FACTS_PER_USER facts for a user. */
async function pruneUser(userId: string): Promise<void> {
  await query(
    `DELETE FROM user_facts
      WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM user_facts
           WHERE user_id = $1
           ORDER BY salience DESC, updated_at DESC
           LIMIT $2
        )`,
    [userId, MAX_FACTS_PER_USER]
  );
}

/**
 * Insert a fact, or merge into a near-identical existing fact (vector dedup).
 * Prunes the user's facts to the cap afterward. No-op on empty text.
 */
export async function upsertFact(userId: string, input: FactInput): Promise<void> {
  const fact = input.fact?.trim();
  if (!userId || !fact) return;

  const salience = clampSalience(input.salience);
  const embedding = await embedOne(fact);

  if (embedding) {
    const vec = toVectorLiteral(embedding);
    const { rows } = await query<{ id: string; distance: number }>(
      `SELECT id, (embedding <=> $2::vector) AS distance
         FROM user_facts
        WHERE user_id = $1 AND embedding IS NOT NULL
        ORDER BY embedding <=> $2::vector
        LIMIT 1`,
      [userId, vec]
    );
    const nearest = rows[0];
    if (nearest && Number(nearest.distance) <= DEDUP_MAX_DISTANCE) {
      await query(
        `UPDATE user_facts
            SET fact = $2,
                category = COALESCE($3, category),
                event_date = COALESCE($4::date, event_date),
                source_character = COALESCE($5, source_character),
                salience = GREATEST(salience, $6),
                embedding = $7::vector,
                updated_at = NOW()
          WHERE id = $1`,
        [nearest.id, fact.slice(0, 600), input.category ?? null, input.eventDate ?? null,
         input.sourceCharacter ?? null, salience, vec]
      );
      return;
    }

    await query(
      `INSERT INTO user_facts
         (user_id, fact, category, event_date, source_character, salience, embedding)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7::vector)`,
      [userId, fact.slice(0, 600), input.category ?? null, input.eventDate ?? null,
       input.sourceCharacter ?? null, salience, vec]
    );
    return;
  }

  // No embedding (provider offline) — store without vector; re-embedded later.
  await query(
    `INSERT INTO user_facts
       (user_id, fact, category, event_date, source_character, salience)
     VALUES ($1, $2, $3, $4::date, $5, $6)`,
    [userId, fact.slice(0, 600), input.category ?? null, input.eventDate ?? null,
     input.sourceCharacter ?? null, salience]
  );
}

export async function upsertFacts(userId: string, inputs: FactInput[]): Promise<void> {
  let changed = false;
  for (const input of inputs) {
    try {
      await upsertFact(userId, input);
      changed = true;
    } catch (err) {
      console.warn("[memory] upsertFact failed:", err instanceof Error ? err.message : err);
    }
  }
  if (changed) {
    await pruneUser(userId).catch(() => {});
  }
}

/**
 * Hybrid retrieval (Mem0 v3 style): fuse semantic vector similarity with
 * Russian full-text keyword ranking via Reciprocal Rank Fusion, then break
 * ties by salience and recency (latest-truth-wins). Degrades gracefully:
 *  - no embedding (provider down) → lexical-only;
 *  - no query text → salience/recency.
 */
export async function searchFacts(
  userId: string,
  queryText: string,
  opts: { topK?: number } = {}
): Promise<UserFact[]> {
  if (!userId) return [];
  const topK = opts.topK ?? 8;
  const trimmed = queryText.trim();

  if (!trimmed) {
    return [];
  }

  const embedding = await embedOne(trimmed, SEARCH_EMBED_TIMEOUT_MS);
  const vec = embedding ? toVectorLiteral(embedding) : null;

  // Reciprocal Rank Fusion (k=60) over two ranked candidate lists.
  const { rows } = await query<FactRow>(
    `WITH       vec_ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $2::vector) AS rnk
          FROM user_facts
         WHERE user_id = $1
           AND $2::vector IS NOT NULL
           AND embedding IS NOT NULL
           AND (embedding <=> $2::vector) <= ${SEARCH_MAX_DISTANCE}
         ORDER BY embedding <=> $2::vector
         LIMIT 20
      ),
      lex_ranked AS (
        SELECT id, ROW_NUMBER() OVER (
                 ORDER BY ts_rank(to_tsvector('russian', fact),
                                  plainto_tsquery('russian', $3)) DESC
               ) AS rnk
          FROM user_facts
         WHERE user_id = $1
           AND to_tsvector('russian', fact) @@ plainto_tsquery('russian', $3)
         LIMIT 20
      ),
      fused AS (
        SELECT id, SUM(score) AS score FROM (
          SELECT id, 1.0 / (60 + rnk) AS score FROM vec_ranked
          UNION ALL
          SELECT id, 1.0 / (60 + rnk) AS score FROM lex_ranked
        ) s
        GROUP BY id
      )
      SELECT ${FACT_COLUMNS_F}
        FROM user_facts f
        JOIN fused ON fused.id = f.id
       ORDER BY fused.score DESC, f.salience DESC, f.updated_at DESC
       LIMIT $4`,
    [userId, vec, trimmed, topK]
  );
  if (rows.length) return rows.map(mapRow);

  return [];
}

/**
 * Dated events from today forward, up to `withinDays` out. This only fetches
 * candidates — callers (see ClientMemory.loadClientMemoryBlock) still relevance-gate
 * anything beyond the imminent lead time before injecting it into the prompt.
 */
export async function getUpcomingEvents(
  userId: string,
  withinDays = 45,
  limit = 5
): Promise<UserFact[]> {
  if (!userId) return [];
  const { rows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS}
       FROM user_facts
      WHERE user_id = $1
        AND event_date IS NOT NULL
        AND event_date >= CURRENT_DATE
        AND event_date <= CURRENT_DATE + ($2 || ' days')::interval
      ORDER BY event_date ASC
      LIMIT $3`,
    [userId, String(withinDays), limit]
  );
  return rows.map(mapRow);
}

export interface GlobalUpcomingEvent {
  factId: string;
  userId: string;
  fact: string;
  eventDate: string;
  sourceCharacter: string | null;
}

/**
 * Cron-facing: dated events across ALL users that fall within `leadDays` and
 * have NOT yet produced an `event_reminder` notification. Dedup is done against
 * the notifications table (no extra schema), so the proactive nudge fires once.
 */
export async function getGlobalUpcomingEvents(
  leadDays = 3,
  limit = 200
): Promise<GlobalUpcomingEvent[]> {
  const { rows } = await query<{
    id: string;
    user_id: string;
    fact: string;
    event_date: string;
    source_character: string | null;
  }>(
    `SELECT f.id, f.user_id, f.fact, f.event_date::text AS event_date, f.source_character
       FROM user_facts f
      WHERE f.event_date IS NOT NULL
        AND f.event_date >= CURRENT_DATE
        AND f.event_date <= CURRENT_DATE + ($1 || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.user_id = f.user_id
             AND n.type = 'event_reminder'
             AND n.data->>'factId' = f.id::text
        )
      ORDER BY f.event_date ASC
      LIMIT $2`,
    [String(leadDays), limit]
  );
  return rows.map((r) => ({
    factId: r.id,
    userId: r.user_id,
    fact: r.fact,
    eventDate: r.event_date,
    sourceCharacter: r.source_character,
  }));
}

/** High-salience facts (salience >= 5) — surfaced only when queryText matches in client-memory. */
export async function getCriticalFacts(userId: string, limit = 3): Promise<UserFact[]> {
  if (!userId) return [];
  const { rows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS}
       FROM user_facts
      WHERE user_id = $1 AND salience >= 5
      ORDER BY updated_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

/** Opportunistically embed facts that were stored without a vector. */
export async function reembedMissingFacts(userId: string, limit = 5): Promise<number> {
  if (!userId) return 0;
  const { rows } = await query<{ id: string; fact: string }>(
    `SELECT id, fact FROM user_facts
      WHERE user_id = $1 AND embedding IS NULL
      LIMIT $2`,
    [userId, limit]
  );
  let done = 0;
  for (const r of rows) {
    const vec = await embedOne(r.fact);
    if (!vec) break; // embeddings still unavailable — stop early
    await query(`UPDATE user_facts SET embedding = $2::vector WHERE id = $1`, [
      r.id,
      toVectorLiteral(vec),
    ]);
    done++;
  }
  return done;
}

/**
 * Maintenance pass (cron/admin): heal facts left without a vector across all
 * users (e.g. inserted while the embeddings provider was down). Stops early if
 * embeddings are unavailable.
 */
export async function runMemoryMaintenance(
  limit = 200
): Promise<{ scanned: number; reembedded: number }> {
  const { rows } = await query<{ id: string; fact: string }>(
    `SELECT id, fact FROM user_facts WHERE embedding IS NULL ORDER BY updated_at ASC LIMIT $1`,
    [limit]
  );
  let reembedded = 0;
  for (const r of rows) {
    const vec = await embedOne(r.fact);
    if (!vec) break; // embeddings unavailable — abort the pass
    await query(`UPDATE user_facts SET embedding = $2::vector WHERE id = $1`, [
      r.id,
      toVectorLiteral(vec),
    ]);
    reembedded++;
  }
  return { scanned: rows.length, reembedded };
}

export async function countFacts(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM user_facts WHERE user_id = $1`,
    [userId]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

export async function listFacts(userId: string, limit = 100): Promise<UserFact[]> {
  const { rows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS}
       FROM user_facts
      WHERE user_id = $1
      ORDER BY salience DESC, updated_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

export async function deleteFact(userId: string, factId: string): Promise<boolean> {
  const res = await query(`DELETE FROM user_facts WHERE user_id = $1 AND id = $2`, [
    userId,
    factId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function purgeFacts(userId: string): Promise<number> {
  const res = await query(`DELETE FROM user_facts WHERE user_id = $1`, [userId]);
  return res.rowCount ?? 0;
}

/** Wipe AI memory only (facts + session summaries). Does not touch chats or cabinet history. */
export async function purgeAllUserMemory(userId: string): Promise<{
  factsRemoved: number;
  sessionMemoriesRemoved: number;
}> {
  const sessionRes = await query(`DELETE FROM session_memories WHERE user_id = $1`, [userId]);
  const factsRes = await query(`DELETE FROM user_facts WHERE user_id = $1`, [userId]);
  return {
    sessionMemoriesRemoved: sessionRes.rowCount ?? 0,
    factsRemoved: factsRes.rowCount ?? 0,
  };
}

export { EMBED_DIM };
