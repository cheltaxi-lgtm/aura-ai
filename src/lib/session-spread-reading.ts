import { query } from "@/lib/db";
import { tarotCardsKey } from "@/lib/tarot";
import type { SessionRow } from "@/lib/session";
import { hasCompleteSpread, normalizeSpreadId } from "@/lib/spreads";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  decodeNumerologSpreadId,
  numerologComputedOnlyTool,
  numerologReadingCacheKey,
  numerologSpreadComplete,
} from "@/lib/numerology/tools";

const MIN_STORED_READING_CHARS = 80;

export type StoredSpreadReadingMeta = {
  reading: string;
  customQuestion: string | null;
};

function sessionSpreadIsComplete(session: SessionRow, characterId: string): boolean {
  const sessionCards = session.cards ?? [];
  const numerologToolId = decodeNumerologSpreadId(session.spread_id);
  if (numerologToolId && isNumerologMaster(characterId)) {
    return numerologSpreadComplete(sessionCards, numerologToolId);
  }
  const spreadId = normalizeSpreadId(session.spread_id);
  return hasCompleteSpread(sessionCards, spreadId, session.spread_type);
}

function pickStoredReading(ctx: Record<string, unknown>): string | null {
  const reading = typeof ctx.reading === "string" ? ctx.reading.trim() : "";
  return reading.length >= MIN_STORED_READING_CHARS ? reading : null;
}

function pickCustomQuestion(ctx: Record<string, unknown>): string | null {
  const q = typeof ctx.customQuestion === "string" ? ctx.customQuestion.trim() : "";
  return q.length >= 8 ? q.slice(0, 500) : null;
}

function asMeta(reading: string | null, customQuestion: string | null = null): StoredSpreadReadingMeta | null {
  if (!reading) return null;
  return { reading, customQuestion };
}

async function findSessionMemoryReading(
  profileUserId: string,
  sessionId: string,
  characterId: string
): Promise<string | null> {
  const { rows } = await query<{ prediction: string }>(
    `SELECT prediction FROM session_memories
     WHERE user_id = $1 AND session_id = $2 AND character_key = $3`,
    [profileUserId, sessionId, characterId]
  );
  const prediction = rows[0]?.prediction?.trim();
  if (!prediction || prediction === "Сеанс в процессе") return null;
  return prediction.length >= MIN_STORED_READING_CHARS ? prediction : null;
}

async function findHistoryMetaBySessionId(
  profileUserId: string,
  characterId: string,
  sessionId: string
): Promise<StoredSpreadReadingMeta | null> {
  const { rows } = await query<{ context_data: Record<string, unknown> }>(
    `SELECT context_data FROM history
     WHERE user_id = $1
       AND character_name = $2
       AND context_data->>'sessionId' = $3
     ORDER BY created_at DESC
     LIMIT 5`,
    [profileUserId, characterId, sessionId]
  );
  for (const row of rows) {
    const reading = pickStoredReading(row.context_data);
    if (reading) {
      return { reading, customQuestion: pickCustomQuestion(row.context_data) };
    }
  }
  return null;
}

function computedNumerologTool(session: SessionRow, characterId: string) {
  const tool = decodeNumerologSpreadId(session.spread_id);
  return tool && isNumerologMaster(characterId) && numerologComputedOnlyTool(tool) ? tool : null;
}

/** Empty cards identify no person. Recover computed readings only within their
 * owned session, preferring the durable report when secondary history failed. */
async function findComputedReadingForSession(
  profileUserId: string, characterId: string, session: SessionRow
): Promise<StoredSpreadReadingMeta | null> {
  const tool = computedNumerologTool(session, characterId);
  if (!tool) return null;
  const { rows } = await query<{ content: string }>(
    `SELECT content FROM numerology_report_history
     WHERE user_id=$1 AND session_id=$2 AND tool_id=$3
     ORDER BY created_at DESC LIMIT 1`,
    [profileUserId, session.id, tool]
  );
  const report = rows[0]?.content?.trim();
  if (report && report.length >= MIN_STORED_READING_CHARS) return asMeta(report);
  const history = await findHistoryMetaBySessionId(profileUserId, characterId, session.id);
  return history ?? asMeta(await findSessionMemoryReading(profileUserId, session.id, characterId));
}

export async function findSpreadReadingForSession(
  profileUserId: string,
  characterId: string,
  session: SessionRow
): Promise<string | null> {
  const meta = await findSpreadReadingMetaForSession(profileUserId, characterId, session);
  return meta?.reading ?? null;
}

async function findSpreadReadingMetaForSession(
  profileUserId: string,
  characterId: string,
  session: SessionRow
): Promise<StoredSpreadReadingMeta | null> {
  if (computedNumerologTool(session, characterId)) {
    return findComputedReadingForSession(profileUserId, characterId, session);
  }
  const sessionCards = session.cards ?? [];
  const spreadId = normalizeSpreadId(session.spread_id);
  const numerologToolId = decodeNumerologSpreadId(session.spread_id);
  const cardKey = sessionSpreadIsComplete(session, characterId)
    ? numerologToolId && isNumerologMaster(characterId)
      ? numerologReadingCacheKey({
          characterId,
          toolId: numerologToolId,
          birthDate: null,
          cardNames: sessionCards,
        })
      : tarotCardsKey(sessionCards.map((name) => ({ name })))
    : "";

  const { rows } = await query<{ context_data: Record<string, unknown>; created_at: Date }>(
    `SELECT context_data, created_at
     FROM history
     WHERE user_id = $1
       AND character_name = $2
       AND context_data->>'type' = 'intention_spread'
     ORDER BY created_at DESC
     LIMIT 30`,
    [profileUserId, characterId]
  );

  for (const row of rows) {
    const ctx = row.context_data;
    // A matching deck draw does not establish ownership of this consultation.
    if (ctx.sessionId !== session.id) continue;
    const reading = pickStoredReading(ctx);
    if (!reading) continue;

    if (ctx.sessionId === session.id) {
      return { reading, customQuestion: pickCustomQuestion(ctx) };
    }

    if (cardKey && session.intention && ctx.intention === session.intention) {
      const stored = ctx.tarotCards as { name: string }[] | undefined;
      if (tarotCardsKey(stored) === cardKey) {
        return { reading, customQuestion: pickCustomQuestion(ctx) };
      }
    }
  }

  return null;
}

/**
 * Load spread reading + optional customQuestion from history for chat repair
 * and memory capture.
 */
export async function findStoredSpreadReadingWithMeta(
  profileUserId: string,
  characterId: string,
  session: SessionRow
): Promise<StoredSpreadReadingMeta | null> {
  if (computedNumerologTool(session, characterId)) {
    return findComputedReadingForSession(profileUserId, characterId, session);
  }
  const bySessionId = await findHistoryMetaBySessionId(
    profileUserId,
    characterId,
    session.id
  );
  if (bySessionId) return bySessionId;

  const intentionMeta = await findSpreadReadingMetaForSession(
    profileUserId,
    characterId,
    session
  );
  if (intentionMeta) return intentionMeta;

  const sessionCards = session.cards ?? [];
  if (!sessionSpreadIsComplete(session, characterId)) {
    return asMeta(await findSessionMemoryReading(profileUserId, session.id, characterId));
  }

  const numerologToolId = decodeNumerologSpreadId(session.spread_id);
  const cardKey =
    numerologToolId && isNumerologMaster(characterId)
      ? null
      : tarotCardsKey(sessionCards.map((name) => ({ name })));

  const { rows } = await query<{ context_data: Record<string, unknown> }>(
    `SELECT context_data, created_at
     FROM history
     WHERE user_id = $1
       AND character_name = $2
       AND context_data->>'type' = 'reading'
     ORDER BY created_at DESC
     LIMIT 30`,
    [profileUserId, characterId]
  );

  for (const row of rows) {
    const ctx = row.context_data;
    // A matching deck draw does not establish ownership of this consultation.
    if (ctx.sessionId !== session.id) continue;
    const reading = pickStoredReading(ctx);
    if (!reading) continue;

    if (numerologToolId && isNumerologMaster(characterId)) {
      if (ctx.numerologToolId !== numerologToolId) continue;
      const stored = ctx.tarotCards as { name: string }[] | undefined;
      if (tarotCardsKey(stored) === tarotCardsKey(sessionCards.map((name) => ({ name })))) {
        return { reading, customQuestion: pickCustomQuestion(ctx) };
      }
      continue;
    }

    const stored = ctx.tarotCards as { name: string }[] | undefined;
    if (cardKey && tarotCardsKey(stored) === cardKey) {
      return { reading, customQuestion: pickCustomQuestion(ctx) };
    }
  }

  return asMeta(await findSessionMemoryReading(profileUserId, session.id, characterId));
}

/** Load spread reading from PostgreSQL (intention_spread + triplet/daily reading rows). */
export async function findStoredSpreadReading(
  profileUserId: string,
  characterId: string,
  session: SessionRow
): Promise<string | null> {
  const meta = await findStoredSpreadReadingWithMeta(profileUserId, characterId, session);
  return meta?.reading ?? null;
}
