import { query } from "@/lib/db";
import { tarotCardsKey } from "@/lib/tarot";
import type { SessionRow } from "@/lib/session";
import { hasCompleteSpread, normalizeSpreadId } from "@/lib/spreads";

const MIN_STORED_READING_CHARS = 80;

function pickStoredReading(ctx: Record<string, unknown>): string | null {
  const reading = typeof ctx.reading === "string" ? ctx.reading.trim() : "";
  return reading.length >= MIN_STORED_READING_CHARS ? reading : null;
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

async function findHistoryReadingBySessionId(
  profileUserId: string,
  characterId: string,
  sessionId: string
): Promise<string | null> {
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
    if (reading) return reading;
  }
  return null;
}

export async function findSpreadReadingForSession(
  profileUserId: string,
  characterId: string,
  session: SessionRow
): Promise<string | null> {
  const sessionCards = session.cards ?? [];
  const spreadId = normalizeSpreadId(session.spread_id);
  const cardKey = hasCompleteSpread(sessionCards, spreadId, session.spread_type)
    ? tarotCardsKey(sessionCards.map((name) => ({ name })))
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
    const reading = pickStoredReading(ctx);
    if (!reading) continue;

    if (ctx.sessionId === session.id) return reading;

    if (cardKey && session.intention && ctx.intention === session.intention) {
      const stored = ctx.tarotCards as { name: string }[] | undefined;
      if (tarotCardsKey(stored) === cardKey) return reading;
    }
  }

  return null;
}

/** Load spread reading from PostgreSQL (intention_spread + triplet/daily reading rows). */
export async function findStoredSpreadReading(
  profileUserId: string,
  characterId: string,
  session: SessionRow
): Promise<string | null> {
  const bySessionId = await findHistoryReadingBySessionId(
    profileUserId,
    characterId,
    session.id
  );
  if (bySessionId) return bySessionId;

  const intentionReading = await findSpreadReadingForSession(
    profileUserId,
    characterId,
    session
  );
  if (intentionReading) return intentionReading;

  const sessionCards = session.cards ?? [];
  const spreadId = normalizeSpreadId(session.spread_id);
  if (!hasCompleteSpread(sessionCards, spreadId, session.spread_type)) {
    return findSessionMemoryReading(profileUserId, session.id, characterId);
  }
  const cardKey = tarotCardsKey(sessionCards.map((name) => ({ name })));
  if (!cardKey) {
    return findSessionMemoryReading(profileUserId, session.id, characterId);
  }

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
    const reading = pickStoredReading(ctx);
    if (!reading) continue;
    const stored = ctx.tarotCards as { name: string }[] | undefined;
    if (tarotCardsKey(stored) === cardKey) return reading;
  }

  return findSessionMemoryReading(profileUserId, session.id, characterId);
}
