/**
 * Durable, cross-master client facts (PostgreSQL + pgvector).
 * Governance: status lifecycle, consent-aware purge, tombstones, supersede.
 */
import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { EMBED_DIM, embedModel, embedTexts } from "@/lib/memory/embeddings";
import { isInstructionLikeFact } from "@/lib/memory/injection-guard";
import {
  isSensitiveFact,
  supersedeGroupForPredicate,
} from "@/lib/memory/predicates";
import { MEMORY_CONSENT_VERSION, revokeMemoryConsent } from "@/lib/memory/preferences";
import {
  addTombstone,
  expireOldTombstones,
  isFactTombstoned,
} from "@/lib/memory/tombstones";
import {
  cancelPendingMemoryJobs,
  purgeMemoryExtractionJobs,
} from "@/lib/memory/extraction-jobs";

export interface UserFact {
  id: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
  sourceCharacter: string | null;
  salience: number;
  status?: string;
  predicateKey?: string | null;
  entityKey?: string | null;
  subjectKey?: string | null;
  sensitivity?: string;
  confidence?: number;
  sourceType?: string | null;
  sourceEntityId?: string | null;
  evidenceQuote?: string | null;
  sourceCapturedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  confirmationCount?: number;
}

export interface FactInput {
  fact: string;
  category?: string | null;
  eventDate?: string | null;
  sourceCharacter?: string | null;
  salience?: number;
  predicateKey?: string | null;
  entityKey?: string | null;
  subjectKey?: string | null;
  operation?: "add" | "replace";
  sensitivity?: "normal" | "sensitive";
  confidence?: number;
  evidenceQuote?: string | null;
  sourceType?: string | null;
  sourceEntityId?: string | null;
  allowSensitive?: boolean;
  forceNewVersion?: boolean;
}

const DEDUP_MAX_DISTANCE = 0.22;
const SEARCH_MAX_DISTANCE = 0.62;
export const MAX_FACTS_PER_USER = 300;
const CRITICAL_DECAY_AFTER_DAYS = 120;
const EMBED_VERSION = "1";

type FactRow = {
  id: string;
  fact: string;
  category: string | null;
  event_date: string | null;
  source_character: string | null;
  salience: number;
  status?: string;
  predicate_key?: string | null;
  entity_key?: string | null;
  subject_key?: string | null;
  sensitivity?: string;
  confidence?: number;
  source_type?: string | null;
  source_entity_id?: string | null;
  evidence_quote?: string | null;
  source_captured_at?: Date | string | null;
  valid_from?: Date | string | null;
  valid_to?: Date | string | null;
  confirmation_count?: number;
};

const FACT_COLUMNS = `id, fact, category, event_date::text AS event_date, source_character, salience,
  status, predicate_key, entity_key, subject_key, sensitivity, confidence, source_type,
  source_entity_id, evidence_quote, source_captured_at, valid_from, valid_to, confirmation_count`;
const FACT_COLUMNS_F = `f.id, f.fact, f.category, f.event_date::text AS event_date, f.source_character, f.salience,
  f.status, f.predicate_key, f.entity_key, f.subject_key, f.sensitivity, f.confidence, f.source_type,
  f.source_entity_id, f.evidence_quote, f.source_captured_at, f.valid_from, f.valid_to, f.confirmation_count`;

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
    status: r.status ?? "active",
    predicateKey: r.predicate_key ?? null,
    entityKey: r.entity_key ?? null,
    subjectKey: r.subject_key ?? null,
    sensitivity: r.sensitivity ?? "normal",
    confidence: r.confidence ?? 1,
    sourceType: r.source_type ?? null,
    sourceEntityId: r.source_entity_id ?? null,
    evidenceQuote: r.evidence_quote ?? null,
    sourceCapturedAt: r.source_captured_at ? new Date(r.source_captured_at).toISOString() : null,
    validFrom: r.valid_from ? new Date(r.valid_from).toISOString() : null,
    validTo: r.valid_to ? new Date(r.valid_to).toISOString() : null,
    confirmationCount: r.confirmation_count ?? 0,
  };
}

async function embedOne(text: string, timeoutMs?: number): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const vectors = await embedTexts(trimmed.slice(0, 4000), timeoutMs);
  return vectors?.[0] ?? null;
}

const SEARCH_EMBED_TIMEOUT_MS = 2500;
const FACT_WRITE_LOCK_CLASS = 823_401;

async function pruneUser(client: PoolClient, userId: string): Promise<void> {
  await queryClient(
    client,
    `DELETE FROM user_facts
      WHERE user_id = $1
        AND status = 'active'
        AND id NOT IN (
          SELECT id FROM user_facts
           WHERE user_id = $1 AND status = 'active'
           ORDER BY salience DESC, updated_at DESC
           LIMIT $2
        )`,
    [userId, MAX_FACTS_PER_USER]
  );
}

async function supersedeReplaceables(
  client: PoolClient,
  userId: string,
  input: FactInput,
  newId: string
): Promise<void> {
  // Singleton / mutually exclusive predicates supersede prior active rows.
  const group = supersedeGroupForPredicate(input.predicateKey);
  if (!group.length) return;
  await queryClient(
    client,
    `UPDATE user_facts
        SET status = 'superseded',
            valid_to = NOW(),
            superseded_by = $4,
            updated_at = NOW()
      WHERE user_id = $1
        AND status = 'active'
        AND id <> $4
        AND predicate_key = ANY($2::text[])
        AND COALESCE(subject_key, 'client') = COALESCE($3, 'client')`,
    [userId, group, input.subjectKey ?? "client", newId]
  );
}

async function upsertFactLocked(
  client: PoolClient,
  userId: string,
  input: FactInput,
  salience: number,
  embedding: number[] | null
): Promise<string | null> {
  const fact = input.fact.trim();
  const sensitivity = isSensitiveFact(input) ? "sensitive" : "normal";
  const model = embedModel();
  const sourceType = input.sourceType ?? (input.sourceCharacter === "user" ? "user" : "chat");

  if (embedding) {
    const vec = toVectorLiteral(embedding);
    const { rows } = await queryClient<{
      id: string;
      distance: number;
      source_character: string | null;
      predicate_key: string | null;
    }>(
      client,
      `SELECT id, (embedding <=> $2::vector) AS distance, source_character, predicate_key
         FROM user_facts
        WHERE user_id = $1 AND embedding IS NOT NULL AND status = 'active'
          AND COALESCE(embedding_model, $3) = $3
        ORDER BY embedding <=> $2::vector
        LIMIT 1`,
      [userId, vec, model]
    );
    const nearest = rows[0];
    const incomingGroup = supersedeGroupForPredicate(input.predicateKey);
    // Contradictory singleton states (e.g. employment.searching → current) must
    // insert + supersede, not collapse into the old row via semantic merge.
    const conflictingPredicate =
      Boolean(nearest?.predicate_key) &&
      Boolean(input.predicateKey) &&
      nearest!.predicate_key !== input.predicateKey &&
      incomingGroup.includes(nearest!.predicate_key!);
    if (
      nearest &&
      Number(nearest.distance) <= DEDUP_MAX_DISTANCE &&
      !conflictingPredicate &&
      !input.forceNewVersion
    ) {
      const incomingUser =
        input.sourceCharacter === "user" || sourceType === "user";
      await queryClient(
        client,
        `UPDATE user_facts
            SET fact = $2,
                category = COALESCE($3, category),
                event_date = COALESCE($4::date, event_date),
                source_character = CASE
                  WHEN $8 THEN 'user'
                  WHEN source_character = 'user' THEN source_character
                  ELSE COALESCE($5, source_character)
                END,
                salience = GREATEST(salience, $6),
                embedding = $7::vector,
                embedding_model = $9,
                embedding_version = $10,
                predicate_key = COALESCE($11, predicate_key),
                entity_key = COALESCE($12, entity_key),
                subject_key = COALESCE($13, subject_key),
                sensitivity = $14,
                confidence = GREATEST(confidence, $15),
                source_type = CASE
                  WHEN $8 THEN 'user'
                  WHEN source_type = 'user' THEN source_type
                  ELSE COALESCE($16, source_type)
                END,
                last_confirmed_at = NOW(),
                consent_version = $17,
                updated_at = NOW()
          WHERE id = $1`,
        [
          nearest.id,
          fact.slice(0, 600),
          input.category ?? null,
          input.eventDate ?? null,
          input.sourceCharacter ?? null,
          salience,
          vec,
          incomingUser,
          model,
          EMBED_VERSION,
          input.predicateKey ?? null,
          input.entityKey ?? null,
          input.subjectKey ?? "client",
          sensitivity,
          input.confidence ?? 1,
          sourceType,
          MEMORY_CONSENT_VERSION,
        ]
      );
      await supersedeReplaceables(client, userId, input, nearest.id);
      return nearest.id;
    }

    const { rows: inserted } = await queryClient<{ id: string }>(
      client,
      `INSERT INTO user_facts
         (user_id, fact, category, event_date, source_character, salience, embedding,
          embedding_model, embedding_version, predicate_key, entity_key, subject_key,
          sensitivity, confidence, source_type, source_entity_id, status, consent_version,
          last_confirmed_at, valid_from)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7::vector,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17,NOW(),NOW())
       RETURNING id`,
      [
        userId,
        fact.slice(0, 600),
        input.category ?? null,
        input.eventDate ?? null,
        input.sourceCharacter ?? null,
        salience,
        vec,
        model,
        EMBED_VERSION,
        input.predicateKey ?? null,
        input.entityKey ?? null,
        input.subjectKey ?? "client",
        sensitivity,
        input.confidence ?? 1,
        sourceType,
        input.sourceEntityId ?? null,
        MEMORY_CONSENT_VERSION,
      ]
    );
    if (inserted[0]) await supersedeReplaceables(client, userId, input, inserted[0].id);
    return inserted[0]?.id ?? null;
  }

  const { rows: textDup } = await queryClient<{ id: string; source_character: string | null }>(
    client,
    `SELECT id, source_character FROM user_facts
      WHERE user_id = $1
        AND status = 'active'
        AND lower(regexp_replace(fact, '\\s+', ' ', 'g')) =
            lower(regexp_replace($2, '\\s+', ' ', 'g'))
      LIMIT 1`,
    [userId, fact.slice(0, 600)]
  );
  if (textDup[0] && !input.forceNewVersion) {
    const incomingUser =
      input.sourceCharacter === "user" || sourceType === "user";
    await queryClient(
      client,
      `UPDATE user_facts
          SET category = COALESCE($2, category),
              event_date = COALESCE($3::date, event_date),
              source_character = CASE
                WHEN $6 THEN 'user'
                WHEN source_character = 'user' THEN source_character
                ELSE COALESCE($4, source_character)
              END,
              salience = GREATEST(salience, $5),
              predicate_key = COALESCE($7, predicate_key),
              entity_key = COALESCE($8, entity_key),
              subject_key = COALESCE($9, subject_key),
              sensitivity = $10,
              source_type = CASE
                WHEN $6 THEN 'user'
                WHEN source_type = 'user' THEN source_type
                ELSE COALESCE($11, source_type)
              END,
              last_confirmed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [
        textDup[0].id,
        input.category ?? null,
        input.eventDate ?? null,
        input.sourceCharacter ?? null,
        salience,
        incomingUser,
        input.predicateKey ?? null,
        input.entityKey ?? null,
        input.subjectKey ?? "client",
        sensitivity,
        sourceType,
      ]
    );
    await supersedeReplaceables(client, userId, input, textDup[0].id);
    return textDup[0].id;
  }

  const { rows: inserted } = await queryClient<{ id: string }>(
    client,
    `INSERT INTO user_facts
       (user_id, fact, category, event_date, source_character, salience,
        predicate_key, entity_key, subject_key, sensitivity, confidence,
        source_type, source_entity_id, status, consent_version, last_confirmed_at, valid_from)
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',$14,NOW(),NOW())
     RETURNING id`,
    [
      userId,
      fact.slice(0, 600),
      input.category ?? null,
      input.eventDate ?? null,
      input.sourceCharacter ?? null,
      salience,
      input.predicateKey ?? null,
      input.entityKey ?? null,
      input.subjectKey ?? "client",
      sensitivity,
      input.confidence ?? 1,
      sourceType,
      input.sourceEntityId ?? null,
      MEMORY_CONSENT_VERSION,
    ]
  );
  if (inserted[0]) await supersedeReplaceables(client, userId, input, inserted[0].id);
  return inserted[0]?.id ?? null;
}

export async function upsertFact(userId: string, input: FactInput): Promise<boolean> {
  const fact = input.fact?.trim();
  if (!userId || !fact) return false;
  if (isInstructionLikeFact(fact)) return false;
  if (await isFactTombstoned(userId, fact)) return false;
  if (isSensitiveFact(input) && !input.allowSensitive && input.sourceCharacter !== "user") {
    return false;
  }

  const salience = clampSalience(input.salience);
  const embedding = await embedOne(fact);

  let storedFactId: string | null = null;
  await withTransaction(async (client) => {
    await queryClient(client, `SELECT pg_advisory_xact_lock($1, hashtext($2))`, [
      FACT_WRITE_LOCK_CLASS,
      userId,
    ]);
    // Re-check tombstone under lock to shrink the race window.
    if (await isFactTombstoned(userId, fact)) return;
    storedFactId = await upsertFactLocked(client, userId, input, salience, embedding);
    await pruneUser(client, userId);
  });
  if (storedFactId && (input.evidenceQuote || input.sourceEntityId)) {
    await query(
      `UPDATE user_facts
          SET evidence_quote = COALESCE($3, evidence_quote),
              source_entity_id = COALESCE($4::uuid, source_entity_id),
              source_captured_at = NOW()
        WHERE user_id = $1 AND id = $2`,
      [
        userId,
        storedFactId,
        input.evidenceQuote?.trim().slice(0, 400) || null,
        input.sourceEntityId ?? null,
      ]
    );
    await query(
      `INSERT INTO user_memory_activity (user_id, fact_id, source_entity_id, activity_type)
       SELECT $1, $2, $3::uuid, 'learned'
        WHERE NOT EXISTS (
          SELECT 1 FROM user_memory_activity
           WHERE user_id = $1 AND fact_id = $2
             AND created_at > NOW() - INTERVAL '10 minutes'
        )`,
      [userId, storedFactId, input.sourceEntityId ?? null]
    );
  }
  return true;
}

export async function upsertFacts(userId: string, inputs: FactInput[]): Promise<number> {
  let stored = 0;
  for (const input of inputs) {
    try {
      if (await upsertFact(userId, input)) stored += 1;
    } catch (err) {
      console.warn("[memory] upsertFact failed:", err instanceof Error ? err.message : err);
    }
  }
  return stored;
}

export async function searchFacts(
  userId: string,
  queryText: string,
  opts: { topK?: number } = {}
): Promise<UserFact[]> {
  if (!userId) return [];
  const topK = opts.topK ?? 8;
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  const embedding = await embedOne(trimmed, SEARCH_EMBED_TIMEOUT_MS);
  const vec = embedding ? toVectorLiteral(embedding) : null;
  const model = embedModel();

  const { rows } = await query<FactRow>(
    `WITH       vec_ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> $2::vector) AS rnk
          FROM user_facts
         WHERE user_id = $1
           AND status = 'active'
           AND $2::vector IS NOT NULL
           AND embedding IS NOT NULL
           AND COALESCE(embedding_model, $5) = $5
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
           AND status = 'active'
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
       WHERE f.status = 'active'
       ORDER BY fused.score DESC, f.salience DESC, f.updated_at DESC
       LIMIT $4`,
    [userId, vec, trimmed, topK, model]
  );
  return rows.map(mapRow);
}

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
        AND status = 'active'
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
       JOIN user_memory_preferences p ON p.user_id = f.user_id
      WHERE f.status = 'active'
        AND p.memory_enabled = TRUE
        AND p.event_reminders_enabled = TRUE
        AND f.event_date IS NOT NULL
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

export async function getCriticalFacts(userId: string, limit = 3): Promise<UserFact[]> {
  if (!userId) return [];
  const { rows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS}
       FROM user_facts
      WHERE user_id = $1 AND status = 'active' AND salience >= 5
      ORDER BY updated_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

export async function reembedMissingFacts(userId: string, limit = 5): Promise<number> {
  if (!userId) return 0;
  const { rows } = await query<{ id: string; fact: string }>(
    `SELECT id, fact FROM user_facts
      WHERE user_id = $1 AND status = 'active' AND embedding IS NULL
      LIMIT $2`,
    [userId, limit]
  );
  let done = 0;
  const model = embedModel();
  for (const r of rows) {
    const vec = await embedOne(r.fact);
    if (!vec) break;
    await query(
      `UPDATE user_facts
          SET embedding = $2::vector,
              embedding_model = $3,
              embedding_version = $4
        WHERE id = $1`,
      [r.id, toVectorLiteral(vec), model, EMBED_VERSION]
    );
    done++;
  }
  return done;
}

export async function decayStaleCriticalFacts(limit = 500): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `UPDATE user_facts
        SET salience = 4
      WHERE id IN (
        SELECT id FROM user_facts
         WHERE salience >= 5
           AND status = 'active'
           AND event_date IS NULL
           AND updated_at < NOW() - ($2 || ' days')::interval
         LIMIT $1
      )
      RETURNING id`,
    [limit, String(CRITICAL_DECAY_AFTER_DAYS)]
  );
  return rows.length;
}

/** TTL: delete expired / past / superseded facts (tombstone first). */
export async function expireStaleFacts(limit = 500): Promise<number> {
  const { rows } = await query<{
    id: string;
    user_id: string;
    fact: string;
    predicate_key: string | null;
  }>(
    `SELECT id, user_id, fact, predicate_key FROM user_facts
      WHERE (
           (status = 'superseded' AND updated_at < NOW() - INTERVAL '90 days')
        OR (event_date IS NOT NULL AND event_date < CURRENT_DATE - INTERVAL '30 days')
        OR (source_type NOT IN ('user', 'profile')
            AND status = 'active'
            AND COALESCE(last_confirmed_at, updated_at) < NOW() - INTERVAL '365 days'
            AND sensitivity = 'normal')
        OR (sensitivity = 'sensitive'
            AND source_type NOT IN ('user', 'profile')
            AND COALESCE(last_confirmed_at, updated_at) < NOW() - INTERVAL '180 days')
      )
      ORDER BY updated_at ASC
      LIMIT $1`,
    [limit]
  );
  if (!rows.length) return 0;
  for (const row of rows) {
    await addTombstone(row.user_id, row.fact, row.predicate_key).catch(() => undefined);
  }
  const ids = rows.map((r) => r.id);
  const deleted = await query(
    `DELETE FROM user_facts WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return deleted.rowCount ?? 0;
}

export const SESSION_MEMORIES_MAINTENANCE_CAP = 200;

export async function pruneAllSessionMemories(
  cap = SESSION_MEMORIES_MAINTENANCE_CAP
): Promise<number> {
  const { rowCount } = await query(
    `DELETE FROM session_memories
      WHERE id IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY user_id ORDER BY session_date DESC
                 ) AS rn
            FROM session_memories
        ) ranked
        WHERE ranked.rn > $1
      )`,
    [cap]
  );
  return rowCount ?? 0;
}

export async function runMemoryMaintenance(
  limit = 200
): Promise<{
  scanned: number;
  reembedded: number;
  decayed: number;
  sessionsPruned: number;
  expired: number;
  tombstonesExpired: number;
}> {
  const { rows } = await query<{ id: string; fact: string }>(
    `SELECT id, fact FROM user_facts
      WHERE embedding IS NULL AND status = 'active'
      ORDER BY updated_at ASC LIMIT $1`,
    [limit]
  );
  let reembedded = 0;
  const model = embedModel();
  for (const r of rows) {
    const vec = await embedOne(r.fact);
    if (!vec) break;
    await query(
      `UPDATE user_facts
          SET embedding = $2::vector, embedding_model = $3, embedding_version = $4
        WHERE id = $1`,
      [r.id, toVectorLiteral(vec), model, EMBED_VERSION]
    );
    reembedded++;
  }
  const decayed = await decayStaleCriticalFacts().catch(() => 0);
  const sessionsPruned = await pruneAllSessionMemories().catch(() => 0);
  const expired = await expireStaleFacts().catch(() => 0);
  const tombstonesExpired = await expireOldTombstones().catch(() => 0);
  return {
    scanned: rows.length,
    reembedded,
    decayed,
    sessionsPruned,
    expired,
    tombstonesExpired,
  };
}

export async function countFacts(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM user_facts
      WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

export async function listFacts(userId: string, limit = 100): Promise<UserFact[]> {
  const { rows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS}
       FROM user_facts
      WHERE user_id = $1 AND status = 'active'
      ORDER BY salience DESC, updated_at DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

export async function listFactTimeline(userId: string, limit = 200): Promise<UserFact[]> {
  const { rows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS}
       FROM user_facts
      WHERE user_id = $1 AND status IN ('active', 'superseded')
      ORDER BY COALESCE(valid_from, source_captured_at, created_at) DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapRow);
}

export async function confirmFact(
  userId: string,
  factId: string
): Promise<UserFact | null> {
  const { rows } = await query<FactRow>(
    `UPDATE user_facts
        SET last_confirmed_at = NOW(),
            confirmation_count = confirmation_count + 1,
            salience = LEAST(5, salience + 1),
            updated_at = NOW()
      WHERE user_id = $1 AND id = $2 AND status = 'active'
      RETURNING ${FACT_COLUMNS}`,
    [userId, factId]
  );
  if (!rows[0]) return null;
  await query(
    `INSERT INTO user_memory_activity (user_id, fact_id, source_entity_id, activity_type)
     VALUES ($1, $2, $3, 'confirmed')`,
    [userId, factId, rows[0].source_entity_id ?? null]
  );
  return mapRow(rows[0]);
}

export async function changeFact(
  userId: string,
  factId: string,
  nextFact: string,
  eventDate?: string | null
): Promise<UserFact | null> {
  const fact = nextFact.trim();
  if (fact.length < 6 || isInstructionLikeFact(fact)) return null;
  const { rows: oldRows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS} FROM user_facts
      WHERE user_id = $1 AND id = $2 AND status = 'active' LIMIT 1`,
    [userId, factId]
  );
  const old = oldRows[0] ? mapRow(oldRows[0]) : null;
  if (!old) return null;

  const stored = await upsertFact(userId, {
    fact,
    category: old.category,
    eventDate: eventDate ?? old.eventDate,
    salience: Math.max(3, old.salience),
    predicateKey: old.predicateKey,
    entityKey: old.entityKey,
    subjectKey: old.subjectKey,
    operation: "replace",
    sensitivity: old.sensitivity === "sensitive" ? "sensitive" : "normal",
    sourceCharacter: "user",
    sourceType: "user",
    allowSensitive: true,
    forceNewVersion: true,
  });
  if (!stored) return null;
  const { rows: nextRows } = await query<FactRow>(
    `SELECT ${FACT_COLUMNS} FROM user_facts
      WHERE user_id = $1 AND status = 'active'
        AND lower(regexp_replace(fact, '\\s+', ' ', 'g')) =
            lower(regexp_replace($2, '\\s+', ' ', 'g'))
      ORDER BY created_at DESC LIMIT 1`,
    [userId, fact.slice(0, 600)]
  );
  const next = nextRows[0] ? mapRow(nextRows[0]) : null;
  if (!next) return null;
  await query(
    `UPDATE user_facts
        SET status = 'superseded', valid_to = NOW(), superseded_by = $3, updated_at = NOW()
      WHERE user_id = $1 AND id = $2 AND id <> $3 AND status = 'active'`,
    [userId, factId, next.id]
  );
  await query(
    `INSERT INTO user_memory_activity (user_id, fact_id, source_entity_id, activity_type)
     VALUES ($1, $2, $3, 'changed')`,
    [userId, next.id, next.sourceEntityId ?? null]
  );
  return next;
}

export async function deleteFact(userId: string, factId: string): Promise<boolean> {
  const { rows } = await query<{ fact: string; predicate_key: string | null }>(
    `DELETE FROM user_facts
      WHERE user_id = $1 AND id = $2
      RETURNING fact, predicate_key`,
    [userId, factId]
  );
  if (!rows[0]) return false;
  await addTombstone(userId, rows[0].fact, rows[0].predicate_key);
  await query(
    `DELETE FROM notifications
      WHERE user_id = $1
        AND type = 'event_reminder'
        AND data->>'factId' = $2`,
    [userId, factId]
  ).catch(() => undefined);
  return true;
}

export async function updateFact(
  userId: string,
  factId: string,
  input: FactInput
): Promise<UserFact | null> {
  const fact = input.fact?.trim();
  if (!userId || !factId || !fact) return null;
  if (isInstructionLikeFact(fact) || !fact) return null;
  if (await isFactTombstoned(userId, fact)) return null;

  const embedding = await embedOne(fact);
  const model = embedModel();
  const incomingUser =
    input.sourceCharacter === "user" || input.sourceType === "user";
  const { rows } = await query<FactRow>(
    `UPDATE user_facts
        SET fact = $3,
            category = COALESCE($4, category),
            event_date = COALESCE($5::date, event_date),
            salience = GREATEST(salience, $6),
            predicate_key = COALESCE($7, predicate_key),
            entity_key = COALESCE($8, entity_key),
            subject_key = COALESCE($9, subject_key),
            sensitivity = $10,
            embedding = COALESCE($11::vector, embedding),
            embedding_model = CASE WHEN $11::vector IS NULL THEN embedding_model ELSE $12 END,
            embedding_version = CASE WHEN $11::vector IS NULL THEN embedding_version ELSE $13 END,
            source_character = CASE WHEN $14 THEN 'user' ELSE source_character END,
            source_type = CASE WHEN $14 THEN 'user' ELSE source_type END,
            last_confirmed_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $1 AND id = $2 AND status = 'active'
      RETURNING ${FACT_COLUMNS}`,
    [
      userId,
      factId,
      fact.slice(0, 600),
      input.category ?? null,
      input.eventDate ?? null,
      clampSalience(input.salience),
      input.predicateKey ?? null,
      input.entityKey ?? null,
      input.subjectKey ?? "client",
      isSensitiveFact(input) ? "sensitive" : "normal",
      embedding ? toVectorLiteral(embedding) : null,
      model,
      EMBED_VERSION,
      incomingUser,
    ]
  );
  const updated = rows[0] ? mapRow(rows[0]) : null;
  if (updated) {
    await withTransaction(async (client) => {
      await supersedeReplaceables(client, userId, input, updated.id);
    }).catch(() => undefined);
  }
  return updated;
}

export async function purgeFacts(userId: string): Promise<number> {
  const res = await query(`DELETE FROM user_facts WHERE user_id = $1`, [userId]);
  return res.rowCount ?? 0;
}

/** Wipe AI memory + reminders + jobs; revoke consent; keep tombstones against re-ingest. */
export async function purgeAllUserMemory(userId: string): Promise<{
  factsRemoved: number;
  sessionMemoriesRemoved: number;
  remindersRemoved: number;
  jobsRemoved: number;
  tombstonesAdded: number;
}> {
  await cancelPendingMemoryJobs(userId).catch(() => 0);
  const jobsRemoved = await purgeMemoryExtractionJobs(userId).catch(() => 0);

  const { rows: doomed } = await query<{ fact: string; predicate_key: string | null }>(
    `SELECT fact, predicate_key FROM user_facts WHERE user_id = $1`,
    [userId]
  );
  let tombstonesAdded = 0;
  for (const row of doomed) {
    try {
      await addTombstone(userId, row.fact, row.predicate_key);
      tombstonesAdded += 1;
    } catch {
      /* keep purging even if a fingerprint write fails */
    }
  }

  const sessionRes = await query(`DELETE FROM session_memories WHERE user_id = $1`, [userId]);
  const factsRes = await query(`DELETE FROM user_facts WHERE user_id = $1`, [userId]);
  const remindersRes = await query(
    `DELETE FROM notifications WHERE user_id = $1 AND type = 'event_reminder'`,
    [userId]
  );
  await revokeMemoryConsent(userId).catch(() => undefined);
  return {
    sessionMemoriesRemoved: sessionRes.rowCount ?? 0,
    factsRemoved: factsRes.rowCount ?? 0,
    remindersRemoved: remindersRes.rowCount ?? 0,
    jobsRemoved,
    tombstonesAdded,
  };
}

export { EMBED_DIM };
