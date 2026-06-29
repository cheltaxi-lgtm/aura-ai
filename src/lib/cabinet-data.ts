import { query, withTransaction } from "@/lib/db";
import { getUserById } from "@/lib/users";
import { getRuneBalance, getRuneTransactions } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { getUserSubscription } from "@/lib/accounts";
import { getLegacyPrices } from "@/lib/yukassa";
import { listDiaryEntries } from "@/lib/diary";
import { deleteConsultationSession, getSession } from "@/lib/session";
import { ensureSessionMemoryStub } from "@/lib/session-memory";
import { topicLabel, type SessionTopicId } from "@/lib/session-topics";
import {
  ACHIEVEMENTS,
  type AchievementKey,
  getUserStats,
} from "@/lib/achievements";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";

export interface CabinetProfile {
  id: string;
  name: string;
  email: string;
  zodiac: string | null;
  birthDate: string | null;
  runeBalance: number;
  createdAt: string | null;
}

export interface CabinetStats {
  totalSessions: number;
  favoriteMaster: string | null;
  daysWithUs: number;
  totalCards: number;
}

export interface CabinetSessionRow {
  id: string;
  sessionId: string | null;
  characterKey: string;
  sessionDate: string;
  createdAt: string;
  topicSummary: string;
  keyCards: string[];
  prediction: string;
  mood: string | null;
  outcomeRating: number | null;
}

export interface CabinetAchievementEarned {
  key: AchievementKey;
  label: string;
  description: string;
  bonus: number;
  earnedAt: string;
}

export interface CabinetAchievementLocked {
  key: AchievementKey;
  label: string;
  description: string;
  bonus: number;
  progress: number;
  progressMax: number;
  progressLabel: string;
}

export interface CabinetDiaryPreview {
  id: string;
  characterKey: string;
  entryText: string;
  createdAt: string;
}

export interface CabinetRuneTransaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  actionType: string | null;
  createdAt: string;
}

export interface CabinetLegacyAccess {
  paidUntil: string | null;
  hasSingleUnlock: boolean;
  isUnlimited: boolean;
  singlePrice: number;
  subscriptionPrice: number;
}

export interface CabinetPhotoSpreadRow {
  id: string;
  characterName: string;
  createdAt: string;
  contextData: {
    analysis?: string;
    deckType?: string;
    spreadType?: string;
    deckSystem?: string;
    tarotCards?: { name: string; meaning?: string }[];
    redrawSpread?: RedrawSpread;
    question?: string;
  };
}

export interface CabinetDailyReadingRow {
  id: string;
  characterKey: string;
  readingDate: string;
  readingText: string;
  deckSystem: string | null;
  cards: { name: string; meaning?: string; position?: string; reversed?: boolean }[];
}

export async function getCabinetPhotoSpreads(
  profileUserId: string
): Promise<CabinetPhotoSpreadRow[]> {
  const { rows } = await query<{
    id: string;
    character_name: string;
    context_data: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, character_name, context_data, created_at
     FROM history
     WHERE user_id = $1 AND context_data->>'type' = 'photo_reading'
     ORDER BY created_at DESC
     LIMIT 50`,
    [profileUserId]
  );

  return rows.map((row) => ({
    id: row.id,
    characterName: row.character_name,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    contextData: (row.context_data ?? {}) as CabinetPhotoSpreadRow["contextData"],
  }));
}

export async function getCabinetDailyReadings(
  profileUserId: string,
  limit = 30
): Promise<CabinetDailyReadingRow[]> {
  const { rows } = await query<{
    id: string;
    character_key: string;
    reading_text: string;
    cards: unknown;
    deck_system: string | null;
    reading_date: Date | string;
  }>(
    `SELECT id, character_key, reading_text, cards, deck_system, reading_date
     FROM daily_readings
     WHERE user_id = $1
     ORDER BY reading_date DESC
     LIMIT $2`,
    [profileUserId, limit]
  );

  return rows.map((row) => {
    const rawCards = Array.isArray(row.cards) ? row.cards : [];
    const cards = rawCards
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name : "";
        if (!name) return null;
        return {
          name,
          meaning: typeof obj.meaning === "string" ? obj.meaning : undefined,
          position: typeof obj.position === "string" ? obj.position : undefined,
          reversed: Boolean(obj.reversed),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    const readingDate =
      row.reading_date instanceof Date
        ? row.reading_date.toISOString().slice(0, 10)
        : String(row.reading_date).slice(0, 10);

    return {
      id: row.id,
      characterKey: row.character_key,
      readingDate,
      readingText: row.reading_text,
      deckSystem: row.deck_system,
      cards,
    };
  });
}

export async function deleteCabinetPhotoSpread(
  userId: string,
  historyId: string
): Promise<{ ok: boolean; characterName?: string }> {
  const { rows } = await query<{ character_name: string }>(
    `SELECT character_name FROM history
     WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'photo_reading'`,
    [historyId, userId]
  );
  const row = rows[0];
  if (!row) return { ok: false };

  const result = await query(
    `DELETE FROM history
     WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'photo_reading'`,
    [historyId, userId]
  );
  if ((result.rowCount ?? 0) === 0) return { ok: false };

  return { ok: true, characterName: row.character_name };
}

export async function getCabinetProfile(
  profileUserId: string,
  accountEmail: string,
  accountName: string
): Promise<CabinetProfile> {
  const user = await getUserById(profileUserId);
  const balance = await getRuneBalance(profileUserId);
  return {
    id: profileUserId,
    name: user?.name ?? accountName,
    email: accountEmail,
    zodiac: user?.zodiac ?? null,
    birthDate: user?.birth_date ?? null,
    runeBalance: balance,
    createdAt: user?.created_at
      ? user.created_at instanceof Date
        ? user.created_at.toISOString()
        : String(user.created_at)
      : null,
  };
}

export async function getCabinetStats(userId: string): Promise<CabinetStats> {
  const [sessionCount, favorite, daysRow, cardsRow] = await Promise.all([
    query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
       FROM sessions
       WHERE user_id = $1 AND character_key IS NOT NULL AND TRIM(character_key) <> ''`,
      [userId]
    ),
    query<{ character_key: string; cnt: string }>(
      `SELECT character_key, COUNT(*)::text AS cnt
       FROM session_memories WHERE user_id = $1
       GROUP BY character_key ORDER BY COUNT(*) DESC LIMIT 1`,
      [userId]
    ),
    query<{ days: number | null }>(
      `SELECT EXTRACT(DAY FROM NOW() - MIN(created_at))::int AS days
       FROM sessions WHERE user_id = $1`,
      [userId]
    ),
    query<{ total: string }>(
      `SELECT COALESCE(SUM(COALESCE(array_length(key_cards, 1), 0)), 0)::text AS total
       FROM session_memories WHERE user_id = $1`,
      [userId]
    ),
  ]);

  return {
    totalSessions: Number.parseInt(sessionCount.rows[0]?.cnt ?? "0", 10),
    favoriteMaster: favorite.rows[0]?.character_key ?? null,
    daysWithUs: Math.max(0, Number(daysRow.rows[0]?.days ?? 0)),
    totalCards: Number.parseInt(cardsRow.rows[0]?.total ?? "0", 10),
  };
}

export async function getCabinetSessions(
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ sessions: CabinetSessionRow[]; total: number }> {
  const [rows, countRows] = await Promise.all([
    query<{
      id: string;
      session_id: string;
      character_key: string;
      session_date: Date;
      topic_summary: string | null;
      intention: string | null;
      key_cards: string[] | null;
      session_cards: string[] | null;
      prediction: string | null;
      last_assistant: string | null;
      mood: string | null;
      outcome_rating: number | null;
      created_at: Date;
      status: string;
    }>(
      `WITH msg_counts AS (
         SELECT session_id, COUNT(*)::int AS msg_count
         FROM chat_messages
         GROUP BY session_id
       ),
       last_assistant AS (
         SELECT DISTINCT ON (session_id)
           session_id,
           LEFT(content, 1000) AS last_assistant
         FROM chat_messages
         WHERE role = 'assistant'
         ORDER BY session_id, created_at DESC
       )
       SELECT
         COALESCE(sm.id, s.id) AS id,
         s.id AS session_id,
         s.character_key,
         COALESCE(sm.session_date, s.updated_at, s.created_at) AS session_date,
         sm.topic_summary,
         s.intention,
         sm.key_cards,
         s.cards AS session_cards,
         sm.prediction,
         la.last_assistant,
         sm.mood,
         sm.outcome_rating,
         COALESCE(sm.created_at, s.created_at) AS created_at,
         COALESCE(s.status, 'active') AS status
       FROM sessions s
       LEFT JOIN session_memories sm ON sm.session_id = s.id AND sm.user_id = s.user_id
       LEFT JOIN msg_counts mc ON mc.session_id = s.id
       LEFT JOIN last_assistant la ON la.session_id = s.id
       WHERE s.user_id = $1
         AND s.character_key IS NOT NULL
         AND TRIM(s.character_key) <> ''
         AND NOT (
           COALESCE(mc.msg_count, 0) = 0
           AND COALESCE(sm.prediction, 'Сеанс в процессе') = 'Сеанс в процессе'
           AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''
         )
       ORDER BY COALESCE(s.updated_at, sm.created_at, s.created_at) DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    query<{ cnt: string }>(
      `WITH msg_counts AS (
         SELECT session_id, COUNT(*)::int AS msg_count
         FROM chat_messages
         GROUP BY session_id
       )
       SELECT COUNT(*)::text AS cnt
       FROM sessions s
       LEFT JOIN session_memories sm ON sm.session_id = s.id AND sm.user_id = s.user_id
       LEFT JOIN msg_counts mc ON mc.session_id = s.id
       WHERE s.user_id = $1
         AND s.character_key IS NOT NULL
         AND TRIM(s.character_key) <> ''
         AND NOT (
           COALESCE(mc.msg_count, 0) = 0
           AND COALESCE(sm.prediction, 'Сеанс в процессе') = 'Сеанс в процессе'
           AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''
         )`,
      [userId]
    ),
  ]);

  const sessions = rows.rows.map((r) => {
    const topicFromIntention =
      r.intention && r.intention.trim()
        ? topicLabel(r.intention as SessionTopicId)
        : "Сеанс";
    const keyCards =
      (r.key_cards?.length ? r.key_cards : r.session_cards) ?? [];
    const stubPrediction = r.prediction?.trim() === "Сеанс в процессе";
    const prediction =
      r.status === "active"
        ? r.prediction?.trim() ||
          r.last_assistant?.trim() ||
          "Сеанс в процессе"
        : stubPrediction
          ? r.last_assistant?.trim() || "Сеанс завершён"
          : r.prediction?.trim() ||
            r.last_assistant?.trim() ||
            "Сеанс завершён";

    return {
      id: r.id,
      sessionId: r.session_id,
      characterKey: r.character_key,
      sessionDate: r.session_date.toISOString(),
      createdAt: r.created_at.toISOString(),
      topicSummary: r.topic_summary?.trim() || topicFromIntention,
      keyCards,
      prediction,
      mood: r.mood,
      outcomeRating: r.outcome_rating,
    };
  });

  return {
    sessions,
    total: Number.parseInt(countRows.rows[0]?.cnt ?? "0", 10),
  };
}

async function maxSessionsWithOneMaster(userId: string): Promise<number> {
  const { rows } = await query<{ cnt: string }>(
    `SELECT MAX(c)::text AS cnt FROM (
       SELECT COUNT(*) AS c FROM session_memories
       WHERE user_id = $1 GROUP BY character_key
     ) sub`,
    [userId]
  );
  return Number.parseInt(rows[0]?.cnt ?? "0", 10);
}

export async function getCabinetAchievements(
  userId: string
): Promise<{ earned: CabinetAchievementEarned[]; locked: CabinetAchievementLocked[] }> {
  const { rows: earnedRows } = await query<{ achievement: string; earned_at: Date }>(
    `SELECT achievement, earned_at FROM user_achievements WHERE user_id = $1 ORDER BY earned_at DESC`,
    [userId]
  );

  const earnedKeys = new Set(earnedRows.map((r) => r.achievement));
  const stats = await getUserStats(userId, "veronika");
  const maxMasterSessions = await maxSessionsWithOneMaster(userId);

  const earned: CabinetAchievementEarned[] = earnedRows
    .filter((r) => r.achievement in ACHIEVEMENTS)
    .map((r) => {
      const key = r.achievement as AchievementKey;
      const ach = ACHIEVEMENTS[key];
      return {
        key,
        label: ach.label,
        description: ach.description,
        bonus: ach.bonus,
        earnedAt:
          r.earned_at instanceof Date ? r.earned_at.toISOString() : String(r.earned_at),
      };
    });

  const locked: CabinetAchievementLocked[] = [];

  for (const key of Object.keys(ACHIEVEMENTS) as AchievementKey[]) {
    if (earnedKeys.has(key)) continue;
    const ach = ACHIEVEMENTS[key];
    let progress = 0;
    let progressMax = 1;
    let progressLabel = "";

    switch (key) {
      case "first_message":
        progress = Math.min(stats.totalMessages, 1);
        progressMax = 1;
        progressLabel = stats.totalMessages >= 1 ? "1/1" : "0/1";
        break;
      case "week_streak":
        progress = stats.currentStreak;
        progressMax = 7;
        progressLabel = `${Math.min(stats.currentStreak, 7)}/7 дней`;
        break;
      case "loyal_master":
        progress = maxMasterSessions;
        progressMax = 10;
        progressLabel = `${Math.min(maxMasterSessions, 10)}/10 сеансов`;
        break;
      case "brave_question":
        progress = 0;
        progressMax = 1;
        progressLabel = "Спроси о сложном";
        break;
      case "month_in":
        progress = stats.daysTotal;
        progressMax = 30;
        progressLabel = `${Math.min(stats.daysTotal, 30)}/30 дней`;
        break;
    }

    locked.push({
      key,
      label: ach.label,
      description: ach.description,
      bonus: ach.bonus,
      progress,
      progressMax,
      progressLabel,
    });
  }

  return { earned, locked };
}

export async function getCabinetDiaryPreview(
  userId: string,
  limit = 3
): Promise<CabinetDiaryPreview[]> {
  const entries = await listDiaryEntries(userId, limit);
  return entries.map((e) => ({
    id: e.id,
    characterKey: e.character_key,
    entryText: e.entry_text,
    createdAt:
      e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
  }));
}

export async function getCabinetRunes(userId: string) {
  const settings = await getRuneSettings();
  const balance = await getRuneBalance(userId);
  const transactions = await getRuneTransactions(userId, 40);
  return {
    enabled: settings.enabled,
    balance,
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balance_after,
      description: t.description,
      actionType: t.action_type,
      createdAt:
        t.created_at instanceof Date ? t.created_at.toISOString() : String(t.created_at),
    })) as CabinetRuneTransaction[],
  };
}

export async function getCabinetLegacyAccess(userId: string): Promise<CabinetLegacyAccess | null> {
  const settings = await getRuneSettings();
  if (settings.enabled) return null;

  const [sub, prices] = await Promise.all([
    getUserSubscription(userId),
    getLegacyPrices(),
  ]);

  return {
    paidUntil: sub?.paid_until
      ? sub.paid_until instanceof Date
        ? sub.paid_until.toISOString()
        : String(sub.paid_until)
      : null,
    hasSingleUnlock: Boolean(sub?.has_single_unlock),
    isUnlimited: Boolean(sub?.is_unlimited),
    singlePrice: prices.single,
    subscriptionPrice: prices.subscription,
  };
}

export async function getSessionMemoryById(
  userId: string,
  sessionId: string
): Promise<CabinetSessionRow | null> {
  const { rows } = await query<{
    id: string;
    session_id: string | null;
    character_key: string;
    session_date: Date;
    topic_summary: string;
    key_cards: string[];
    prediction: string;
    mood: string | null;
    outcome_rating: number | null;
    created_at: Date;
  }>(
    `SELECT id, session_id, character_key, session_date, topic_summary, key_cards,
            prediction, mood, outcome_rating, created_at
     FROM session_memories
     WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    sessionId: r.session_id ?? null,
    characterKey: r.character_key,
    sessionDate: r.session_date.toISOString(),
    createdAt: r.created_at.toISOString(),
    topicSummary: r.topic_summary,
    keyCards: r.key_cards ?? [],
    prediction: r.prediction,
    mood: r.mood,
    outcomeRating: r.outcome_rating,
  };
}

export async function updateSessionOutcomeRating(
  userId: string,
  sessionId: string,
  rating: number
): Promise<boolean> {
  let { rows } = await query<{ id: string }>(
    `UPDATE session_memories SET outcome_rating = $3
     WHERE user_id = $2 AND (id = $1 OR session_id = $1::uuid)
     RETURNING id`,
    [sessionId, userId, rating]
  );
  if (rows[0]) return true;

  const session = await getSession(sessionId);
  if (session?.user_id === userId && session.character_key) {
    const topic =
      session.intention?.trim()
        ? topicLabel(session.intention as SessionTopicId)
        : "Сеанс";
    await ensureSessionMemoryStub({
      userId,
      sessionId,
      characterKey: session.character_key,
      topicSummary: topic,
      keyCards: session.cards ?? [],
    });
    ({ rows } = await query<{ id: string }>(
      `UPDATE session_memories SET outcome_rating = $3
       WHERE user_id = $2 AND session_id = $1
       RETURNING id`,
      [sessionId, userId, rating]
    ));
  }

  return Boolean(rows[0]);
}

/** Delete cabinet session entry with full sync (chat, sessions, history). */
export async function deleteCabinetSessionEntry(
  userId: string,
  memoryId: string
): Promise<{ ok: boolean; characterKey?: string }> {
  const { rows } = await query<{ session_id: string | null; character_key: string }>(
    `SELECT session_id, character_key FROM session_memories WHERE id = $1 AND user_id = $2`,
    [memoryId, userId]
  );
  const row = rows[0];

  if (row?.session_id) {
    const ok = await deleteConsultationSession(row.session_id, userId);
    return { ok, characterKey: row.character_key };
  }

  if (row) {
    await query(`DELETE FROM session_memories WHERE id = $1 AND user_id = $2`, [memoryId, userId]);
    return { ok: true, characterKey: row.character_key };
  }

  const session = await getSession(memoryId);
  if (session?.user_id === userId && session.character_key) {
    const ok = await deleteConsultationSession(memoryId, userId);
    return { ok, characterKey: session.character_key };
  }

  return { ok: false };
}

export interface PurgeUserCabinetResult {
  sessionsRemoved: number;
  sessionsCleared: number;
  chatMessagesRemoved: number;
  historyRemoved: number;
  diaryRemoved: number;
  ritualsRemoved: number;
  memoriesRemoved: number;
  achievementsRemoved: number;
  notificationsRemoved: number;
  dailyReadingsRemoved: number;
  factsRemoved: number;
}

/** Irreversibly wipe user activity: sessions, chats, diary, rituals, spreads. Keeps earned achievements & rune bonuses. */
export async function purgeUserCabinetData(userId: string): Promise<PurgeUserCabinetResult> {
  return withTransaction(async (client) => {
    const run = async (text: string, params?: unknown[]) => {
      const result = await client.query(text, params);
      return result.rowCount ?? 0;
    };

    const ritualsRemoved = await run(`DELETE FROM rituals WHERE user_id = $1`, [userId]);
    const notificationsRemoved = await run(`DELETE FROM notifications WHERE user_id = $1`, [userId]);
    const diaryRemoved = await run(`DELETE FROM diary_entries WHERE user_id = $1`, [userId]);
    const memoriesRemoved = await run(`DELETE FROM session_memories WHERE user_id = $1`, [userId]);
    const factsRemoved = await run(`DELETE FROM user_facts WHERE user_id = $1`, [userId]);
    const dailyReadingsRemoved = await run(`DELETE FROM daily_readings WHERE user_id = $1`, [userId]);
    const historyRemoved = await run(`DELETE FROM history WHERE user_id = $1`, [userId]);

    const chatMessagesRemoved = await run(
      `DELETE FROM chat_messages cm
       WHERE cm.owner_user_id = $1
          OR cm.session_id IN (SELECT id FROM sessions WHERE user_id = $1)`,
      [userId]
    );

    const sessionsRemoved = await run(
      `DELETE FROM sessions s
       WHERE s.user_id = $1
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.session_id = s.id)`,
      [userId]
    );

    const sessionsCleared = await run(
      `UPDATE sessions
       SET character_key = NULL,
           intention = NULL,
           spread_type = NULL,
           cards = NULL,
           awaiting_context = FALSE,
           status = 'completed',
           free_questions_used = 0,
           updated_at = NOW()
       WHERE user_id = $1
         AND EXISTS (SELECT 1 FROM payments p WHERE p.session_id = sessions.id)`,
      [userId]
    );

    return {
      sessionsRemoved,
      sessionsCleared,
      chatMessagesRemoved,
      historyRemoved,
      diaryRemoved,
      ritualsRemoved,
      memoriesRemoved,
      achievementsRemoved: 0,
      notificationsRemoved,
      dailyReadingsRemoved,
      factsRemoved,
    };
  });
}
