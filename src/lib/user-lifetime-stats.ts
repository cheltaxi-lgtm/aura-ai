import { query } from "@/lib/db";

export interface UserLifetimeStatsRow {
  totalSessions: number;
  totalCards: number;
  masterCounts: Record<string, number>;
}

function parseMasterCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export function pickFavoriteMaster(masterCounts: Record<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of Object.entries(masterCounts)) {
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best;
}

async function computeLiveStatsForBackfill(userId: string): Promise<UserLifetimeStatsRow> {
  const [sessionCount, masterRows, cardsRow] = await Promise.all([
    query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM sessions
       WHERE user_id = $1 AND character_key IS NOT NULL AND TRIM(character_key) <> ''`,
      [userId]
    ),
    query<{ character_key: string; cnt: string }>(
      `SELECT character_key, COUNT(*)::text AS cnt
       FROM session_memories WHERE user_id = $1
       GROUP BY character_key`,
      [userId]
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(COALESCE(array_length(key_cards, 1), 0)), 0)::text AS total
       FROM session_memories WHERE user_id = $1`,
      [userId]
    ),
  ]);

  const masterCounts: Record<string, number> = {};
  for (const row of masterRows.rows) {
    masterCounts[row.character_key] = Number.parseInt(row.cnt ?? "0", 10);
  }

  return {
    totalSessions: Number.parseInt(sessionCount.rows[0]?.cnt ?? "0", 10),
    totalCards: Number.parseInt(cardsRow.rows[0]?.total ?? "0", 10),
    masterCounts,
  };
}

async function backfillSessionSnapshots(userId: string): Promise<void> {
  await query(
    `INSERT INTO user_lifetime_session_snapshots (session_id, user_id, character_key, cards_count)
     SELECT session_id, user_id, character_key, COALESCE(array_length(key_cards, 1), 0)
     FROM session_memories
     WHERE user_id = $1 AND session_id IS NOT NULL
     ON CONFLICT (session_id, user_id) DO NOTHING`,
    [userId]
  );
}

async function ensureLifetimeStatsRow(userId: string): Promise<UserLifetimeStatsRow> {
  const existing = await query<{
    total_sessions: number;
    total_cards: number;
    master_counts: unknown;
  }>(`SELECT total_sessions, total_cards, master_counts FROM user_lifetime_stats WHERE user_id = $1`, [
    userId,
  ]);

  if (existing.rows[0]) {
    return {
      totalSessions: existing.rows[0].total_sessions,
      totalCards: existing.rows[0].total_cards,
      masterCounts: parseMasterCounts(existing.rows[0].master_counts),
    };
  }

  const live = await computeLiveStatsForBackfill(userId);
  await query(
    `INSERT INTO user_lifetime_stats (user_id, total_sessions, total_cards, master_counts, backfilled_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW())`,
    [userId, live.totalSessions, live.totalCards, JSON.stringify(live.masterCounts)]
  );
  await backfillSessionSnapshots(userId);
  return live;
}

export async function getLifetimeStats(userId: string): Promise<UserLifetimeStatsRow> {
  return ensureLifetimeStatsRow(userId);
}

export async function getDaysWithUs(userId: string): Promise<number> {
  const { rows } = await query<{ days: number | null }>(
    `SELECT GREATEST(0, EXTRACT(DAY FROM NOW() - created_at)::int) AS days
     FROM users WHERE id = $1`,
    [userId]
  );
  return Math.max(0, Number(rows[0]?.days ?? 0));
}

async function incrementLifetimeStats(
  userId: string,
  delta: { sessions?: number; cards?: number; masterKey?: string; masterDelta?: number }
): Promise<void> {
  await ensureLifetimeStatsRow(userId);

  const sessions = delta.sessions ?? 0;
  const cards = delta.cards ?? 0;
  const masterKey = delta.masterKey;
  const masterDelta = delta.masterDelta ?? (masterKey ? 1 : 0);

  if (masterKey && masterDelta !== 0) {
    await query(
      `UPDATE user_lifetime_stats
       SET total_sessions = total_sessions + $2,
           total_cards = total_cards + $3,
           master_counts = master_counts || jsonb_build_object(
             $4,
             COALESCE((master_counts->>$4)::int, 0) + $5
           ),
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, sessions, cards, masterKey, masterDelta]
    );
    return;
  }

  await query(
    `UPDATE user_lifetime_stats
     SET total_sessions = total_sessions + $2,
         total_cards = total_cards + $3,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, sessions, cards]
  );
}

/** Record session activity once per session_id; cards can grow on updates. */
export async function recordLifetimeSessionActivity(input: {
  userId: string;
  sessionId: string;
  characterKey: string;
  cardCount: number;
}): Promise<void> {
  const cardCount = Math.max(0, input.cardCount);
  const { rows } = await query<{ cards_count: number }>(
    `SELECT cards_count FROM user_lifetime_session_snapshots
     WHERE session_id = $1 AND user_id = $2`,
    [input.sessionId, input.userId]
  );

  const prev = rows[0]?.cards_count;
  if (prev == null) {
    await query(
      `INSERT INTO user_lifetime_session_snapshots (session_id, user_id, character_key, cards_count)
       VALUES ($1, $2, $3, $4)`,
      [input.sessionId, input.userId, input.characterKey, cardCount]
    );
    await incrementLifetimeStats(input.userId, {
      sessions: 1,
      cards: cardCount,
      masterKey: input.characterKey,
      masterDelta: 1,
    });
    return;
  }

  const nextCount = Math.max(prev, cardCount);
  if (nextCount === prev) return;

  await query(
    `UPDATE user_lifetime_session_snapshots
     SET cards_count = $3, character_key = $4
     WHERE session_id = $1 AND user_id = $2`,
    [input.sessionId, input.userId, nextCount, input.characterKey]
  );
  await incrementLifetimeStats(input.userId, { cards: nextCount - prev });
}

/** Memory rows without session_id (legacy) — count once per call. */
export async function recordLifetimeOrphanMemory(input: {
  userId: string;
  characterKey: string;
  cardCount: number;
}): Promise<void> {
  await incrementLifetimeStats(input.userId, {
    sessions: 1,
    cards: Math.max(0, input.cardCount),
    masterKey: input.characterKey,
    masterDelta: 1,
  });
}
