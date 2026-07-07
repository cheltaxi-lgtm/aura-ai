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
  const { rows } = await query<{
    total_sessions: string;
    total_cards: string;
    master_counts: unknown;
  }>(
    `WITH memory_rows AS (
       SELECT
         sm.character_key,
         sm.session_id,
         COALESCE(array_length(sm.key_cards, 1), 0) AS memory_cards
       FROM session_memories sm
       WHERE sm.user_id = $1
     ),
     session_rows AS (
       SELECT
         s.id AS session_id,
         s.character_key,
         CASE
           WHEN s.cards IS NOT NULL AND jsonb_typeof(s.cards) = 'array'
           THEN jsonb_array_length(s.cards)
           ELSE 0
         END AS session_cards
       FROM sessions s
       WHERE s.user_id = $1
     ),
     merged_sessions AS (
       SELECT
         COALESCE(m.session_id, sr.session_id) AS session_id,
         COALESCE(m.character_key, sr.character_key) AS character_key,
         GREATEST(COALESCE(m.memory_cards, 0), COALESCE(sr.session_cards, 0)) AS card_count
       FROM memory_rows m
       FULL OUTER JOIN session_rows sr ON sr.session_id = m.session_id
       WHERE COALESCE(m.character_key, sr.character_key) IS NOT NULL
         AND TRIM(COALESCE(m.character_key, sr.character_key)) <> ''
     ),
     orphan_sessions AS (
       SELECT s.id AS session_id, s.character_key, 0 AS card_count
       FROM sessions s
       WHERE s.user_id = $1
         AND s.character_key IS NOT NULL
         AND TRIM(s.character_key) <> ''
         AND COALESCE(s.message_count, 0) > 0
         AND NOT EXISTS (
           SELECT 1 FROM session_memories sm
           WHERE sm.session_id = s.id AND sm.user_id = s.user_id
         )
     ),
     history_only AS (
       SELECT
         h.character_name AS character_key,
         COALESCE(
           CASE
             WHEN jsonb_typeof(h.context_data->'cards') = 'array'
             THEN jsonb_array_length(h.context_data->'cards')
           END,
           CASE
             WHEN jsonb_typeof(h.context_data->'cardNames') = 'array'
             THEN jsonb_array_length(h.context_data->'cardNames')
           END,
           CASE
             WHEN h.context_data ? 'reading'
               OR h.context_data->>'type' IN (
                 'reading', 'intention_spread', 'photo_reading', 'daily_energy'
               )
             THEN 3
             ELSE 0
           END,
           0
         ) AS card_count
       FROM history h
       WHERE h.user_id = $1
         AND (
           h.context_data ? 'cards'
           OR h.context_data ? 'cardNames'
           OR h.context_data ? 'reading'
           OR h.context_data->>'type' IN (
             'reading', 'intention_spread', 'photo_reading', 'daily_energy'
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM session_memories sm
           WHERE sm.user_id = h.user_id
             AND h.context_data->>'sessionId' IS NOT NULL
             AND sm.session_id::text = h.context_data->>'sessionId'
         )
     ),
     all_activities AS (
       SELECT character_key, card_count FROM merged_sessions
       UNION ALL
       SELECT character_key, card_count FROM orphan_sessions
       UNION ALL
       SELECT character_key, card_count FROM history_only WHERE card_count > 0
     ),
     master_agg AS (
       SELECT character_key, COUNT(*)::int AS session_cnt
       FROM all_activities
       WHERE character_key IS NOT NULL AND TRIM(character_key) <> ''
       GROUP BY character_key
     )
     SELECT
       (SELECT COUNT(*)::text FROM all_activities
        WHERE character_key IS NOT NULL AND TRIM(character_key) <> '') AS total_sessions,
       (SELECT COALESCE(SUM(card_count), 0)::text FROM all_activities) AS total_cards,
       (SELECT COALESCE(jsonb_object_agg(character_key, session_cnt), '{}'::jsonb)
        FROM master_agg) AS master_counts`,
    [userId]
  );

  const row = rows[0];
  return {
    totalSessions: Number.parseInt(row?.total_sessions ?? "0", 10),
    totalCards: Number.parseInt(row?.total_cards ?? "0", 10),
    masterCounts: parseMasterCounts(row?.master_counts),
  };
}

async function syncLifetimeStatsCache(userId: string, live: UserLifetimeStatsRow): Promise<void> {
  await query(
    `INSERT INTO user_lifetime_stats (user_id, total_sessions, total_cards, master_counts, backfilled_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       total_sessions = EXCLUDED.total_sessions,
       total_cards = EXCLUDED.total_cards,
       master_counts = EXCLUDED.master_counts,
       updated_at = NOW()`,
    [userId, live.totalSessions, live.totalCards, JSON.stringify(live.masterCounts)]
  );
  await backfillSessionSnapshots(userId);
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
  const live = await computeLiveStatsForBackfill(userId);
  await syncLifetimeStatsCache(userId, live);
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
             $4::text,
             COALESCE((master_counts->>($4::text))::int, 0) + $5
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
