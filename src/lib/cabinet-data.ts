import { query, withTransaction } from "@/lib/db";
import { preserveUserRateLimitsBeforePurge } from "@/lib/rate-limit-anchors";
import { getUserById } from "@/lib/users";
import { getRuneBalance, getRuneTransactions } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { getUserSubscription } from "@/lib/accounts";
import { getLegacyPrices } from "@/lib/yukassa";
import { deleteConsultationSession, getSession } from "@/lib/session";
import { ensureSessionMemoryStub } from "@/lib/session-memory";
import { topicLabel, type SessionTopicId } from "@/lib/session-topics";
import {
  getDaysWithUs,
  getLifetimeStats,
  pickFavoriteMaster,
} from "@/lib/user-lifetime-stats";
import {
  ACHIEVEMENTS,
  type AchievementKey,
  getUserStats,
  preservePermanentGrants,
} from "@/lib/achievements";
import { getUserRitualAchievementStats } from "@/lib/ritual-service";
import { getUserJointReadingAchievementStats } from "@/lib/joint-reading-service";
import type { RedrawSpread } from "@/lib/photo-spread-redraw";

export interface CabinetProfile {
  id: string;
  name: string;
  email: string;
  zodiac: string | null;
  birthDate: string | null;
  birthCity: string | null;
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
  /** Free-form client question (custom spreads) — prefer over generic topic labels. */
  customQuestion?: string | null;
  intention?: string | null;
  spreadId?: string | null;
  spreadType?: string | null;
  keyCards: string[];
  prediction: string;
  mood: string | null;
  outcomeRating: number | null;
  matrixBirthDate?: string | null;
  matrixCalculationVersion?: string | null;
  matrixSubjectName?: string | null;
  matrixSubjectKind?: string | null;
  matrixStructuredData?: Record<string, unknown> | null;
  /** Human Design rows: chart id for the delete action (row id is the report id). */
  hdChartId?: string | null;
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
    /** Personal note the client attaches to a saved reading — own journaling, not shown to the master. */
    notes?: string;
  };
}

export const MAX_PHOTO_SPREAD_NOTE_LENGTH = 500;

export async function updateCabinetPhotoSpreadNote(
  userId: string,
  historyId: string,
  notes: string
): Promise<{ ok: boolean }> {
  const trimmed = notes.trim().slice(0, MAX_PHOTO_SPREAD_NOTE_LENGTH);
  const result = await query(
    `UPDATE history
     SET context_data = jsonb_set(context_data, '{notes}', to_jsonb($3::text))
     WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'photo_reading'`,
    [historyId, userId, trimmed]
  );
  return { ok: (result.rowCount ?? 0) > 0 };
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
  historyId: string,
  options?: { deleteLinkedChat?: boolean }
): Promise<{ ok: boolean; characterName?: string; sessionId?: string }> {
  const { rows } = await query<{ character_name: string; context_data: Record<string, unknown> }>(
    `SELECT character_name, context_data FROM history
     WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'photo_reading'`,
    [historyId, userId]
  );
  const row = rows[0];
  if (!row) return { ok: false };

  const sessionId =
    typeof row.context_data?.sessionId === "string" ? row.context_data.sessionId : undefined;

  const result = await query(
    `DELETE FROM history
     WHERE id = $1 AND user_id = $2 AND context_data->>'type' = 'photo_reading'`,
    [historyId, userId]
  );
  if ((result.rowCount ?? 0) === 0) return { ok: false };

  // Full session wipe — bot/site history both read from `sessions`.
  if (options?.deleteLinkedChat !== false && sessionId) {
    await deleteConsultationSession(sessionId, userId);
  }

  return { ok: true, characterName: row.character_name, sessionId };
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
    birthCity: user?.birth_city ?? null,
    runeBalance: balance,
    createdAt: user?.created_at
      ? user.created_at instanceof Date
        ? user.created_at.toISOString()
        : String(user.created_at)
      : null,
  };
}

export async function getCabinetStats(userId: string): Promise<CabinetStats> {
  const [lifetime, daysWithUs] = await Promise.all([getLifetimeStats(userId), getDaysWithUs(userId)]);

  return {
    totalSessions: lifetime.totalSessions,
    favoriteMaster: pickFavoriteMaster(lifetime.masterCounts),
    daysWithUs,
    totalCards: lifetime.totalCards,
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
      session_id: string | null;
      character_key: string;
      session_date: Date;
      topic_summary: string | null;
      custom_question: string | null;
      intention: string | null;
      spread_id: string | null;
      spread_type: string | null;
      key_cards: string[] | null;
      session_cards: string[] | null;
      prediction: string | null;
      last_assistant: string | null;
      mood: string | null;
      outcome_rating: number | null;
      created_at: Date;
      status: string;
      matrix_birth_date: Date | string | null;
      matrix_calculation_version: string | null;
      matrix_structured_data: Record<string, unknown> | null;
      matrix_subject_name: string | null;
      matrix_subject_kind: string | null;
      hd_chart_id: string | null;
    }>(
      `WITH last_assistant AS (
         SELECT DISTINCT ON (cm.session_id)
           cm.session_id,
           cm.content AS last_assistant
         FROM chat_messages cm
         INNER JOIN sessions us ON us.id = cm.session_id AND us.user_id = $1
         WHERE cm.role = 'assistant'
         ORDER BY cm.session_id, cm.created_at DESC
       )
       SELECT * FROM (
       SELECT
         COALESCE(sm.id, s.id) AS id,
         s.id AS session_id,
         s.character_key,
         COALESCE(sm.session_date, s.updated_at, s.created_at) AS session_date,
         sm.topic_summary,
         (
           SELECT NULLIF(TRIM(h.context_data->>'customQuestion'), '')
           FROM history h
           WHERE h.user_id = s.user_id
             AND h.context_data->>'sessionId' = s.id::text
             AND NULLIF(TRIM(h.context_data->>'customQuestion'), '') IS NOT NULL
           ORDER BY h.created_at DESC
           LIMIT 1
         ) AS custom_question,
         s.intention,
         s.spread_id,
         s.spread_type,
         sm.key_cards,
         s.cards AS session_cards,
         sm.prediction,
         la.last_assistant,
         sm.mood,
         sm.outcome_rating,
         COALESCE(sm.created_at, s.created_at) AS created_at,
         COALESCE(s.status, 'active') AS status,
         n.birth_date AS matrix_birth_date,
         n.calculation_version AS matrix_calculation_version,
         n.structured_data AS matrix_structured_data,
         ms.display_name AS matrix_subject_name,
         ms.kind AS matrix_subject_kind,
         NULL::uuid AS hd_chart_id
       FROM sessions s
       LEFT JOIN session_memories sm ON sm.session_id = s.id AND sm.user_id = s.user_id
       LEFT JOIN last_assistant la ON la.session_id = s.id
       LEFT JOIN LATERAL (
         SELECT nr.subject_id, nr.birth_date, nr.calculation_version, nr.structured_data
         FROM numerology_report_history nr
         WHERE nr.session_id = s.id
           AND nr.user_id = s.user_id
           AND nr.tool_id IN ('destiny_matrix', 'child_matrix', 'matrix_year_forecast')
           AND length(trim(nr.content)) > 0
         ORDER BY nr.created_at DESC
         LIMIT 1
       ) n ON TRUE
       LEFT JOIN matrix_subjects ms ON ms.id = n.subject_id
       WHERE s.user_id = $1
         AND s.character_key IS NOT NULL
         AND TRIM(s.character_key) <> ''
         AND NOT (
           COALESCE(s.message_count, 0) = 0
           AND COALESCE(sm.prediction, 'Сеанс в процессе') = 'Сеанс в процессе'
           AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''
         )
         /* Matrix: hide sessions not linked to an owned report for this session */
         AND NOT (
           (
             COALESCE(s.spread_id, '') IN ('destiny_matrix', 'numerolog:destiny_matrix')
             OR COALESCE(s.spread_id, '') LIKE 'numerolog:destiny_matrix%'
             OR COALESCE(s.intention, '') = 'destiny_matrix'
           )
           AND NOT EXISTS (
             SELECT 1 FROM numerology_report_history n
             WHERE n.user_id = s.user_id
               AND n.tool_id IN ('destiny_matrix', 'child_matrix')
               AND length(trim(n.content)) > 0
               AND n.session_id = s.id
           )
         )
         /* Photo: hide sessions whose photo_reading history row is gone */
         AND NOT (
           COALESCE(s.spread_type, '') = 'photo'
           AND NOT EXISTS (
             SELECT 1 FROM history h
             WHERE h.user_id = s.user_id
               AND h.context_data->>'type' = 'photo_reading'
               AND h.context_data->>'sessionId' = s.id::text
           )
         )
       UNION ALL
       SELECT
         r.id,
         NULL::uuid AS session_id,
         'numerolog' AS character_key,
         r.created_at AS session_date,
         CASE
           WHEN c.subject_kind = 'other' AND NULLIF(trim(c.subject_name), '') IS NOT NULL
             THEN 'Дизайн Человека — ' || trim(c.subject_name)
           ELSE 'Дизайн Человека — полный разбор'
         END AS topic_summary,
         NULL AS custom_question,
         NULL AS intention,
         'human_design' AS spread_id,
         NULL AS spread_type,
         NULL::text[] AS key_cards,
         NULL::jsonb AS session_cards,
         left(r.report_text, 600) AS prediction,
         NULL AS last_assistant,
         NULL AS mood,
         NULL AS outcome_rating,
         r.created_at,
         'done' AS status,
         NULL AS matrix_birth_date,
         NULL AS matrix_calculation_version,
         NULL::jsonb AS matrix_structured_data,
         NULL AS matrix_subject_name,
         NULL AS matrix_subject_kind,
         r.chart_id AS hd_chart_id
       FROM hd_reports r
       JOIN hd_charts c ON c.id = r.chart_id
       WHERE r.user_id = $1
         AND r.status = 'done'
         AND length(trim(r.report_text)) > 0
       ) combined
       ORDER BY session_date DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    query<{ cnt: string }>(
      `SELECT (COUNT(*) + (
         SELECT COUNT(*) FROM hd_reports r
         WHERE r.user_id = $1 AND r.status = 'done' AND length(trim(r.report_text)) > 0
       ))::text AS cnt
       FROM sessions s
       LEFT JOIN session_memories sm ON sm.session_id = s.id AND sm.user_id = s.user_id
       WHERE s.user_id = $1
         AND s.character_key IS NOT NULL
         AND TRIM(s.character_key) <> ''
         AND NOT (
           COALESCE(s.message_count, 0) = 0
           AND COALESCE(sm.prediction, 'Сеанс в процессе') = 'Сеанс в процессе'
           AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''
         )
         AND NOT (
           (
             COALESCE(s.spread_id, '') IN ('destiny_matrix', 'numerolog:destiny_matrix')
             OR COALESCE(s.spread_id, '') LIKE 'numerolog:destiny_matrix%'
             OR COALESCE(s.intention, '') = 'destiny_matrix'
           )
           AND NOT EXISTS (
             SELECT 1 FROM numerology_report_history n
             WHERE n.user_id = s.user_id
               AND n.tool_id IN ('destiny_matrix', 'child_matrix')
               AND length(trim(n.content)) > 0
               AND n.session_id = s.id
           )
         )
         AND NOT (
           COALESCE(s.spread_type, '') = 'photo'
           AND NOT EXISTS (
             SELECT 1 FROM history h
             WHERE h.user_id = s.user_id
               AND h.context_data->>'type' = 'photo_reading'
               AND h.context_data->>'sessionId' = s.id::text
           )
         )`,
      [userId]
    ),
  ]);

  const sessions = rows.rows.map((r) => {
    const topicFromIntention =
      r.intention && r.intention.trim()
        ? topicLabel(r.intention as SessionTopicId)
        : "Сеанс";
    // Prefer the fuller list — session_memories.key_cards is often capped at 3.
    const memCards = r.key_cards?.filter(Boolean) ?? [];
    const sessionCards = r.session_cards?.filter(Boolean) ?? [];
    const keyCards =
      sessionCards.length >= memCards.length ? sessionCards : memCards;
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

    const customQuestion = r.custom_question?.trim() || null;
    const rawTopic = r.topic_summary?.trim() || "";
    const topicLooksLikeQuestion =
      r.spread_id !== "human_design" &&
      rawTopic.length >= 8 &&
      rawTopic !== "Свой вопрос" &&
      rawTopic !== topicFromIntention &&
      !["Сеанс", "Нумерология", "Матрица судьбы", "Три карты дня"].includes(rawTopic);
    const resolvedQuestion =
      customQuestion ||
      (r.intention === "custom" && topicLooksLikeQuestion ? rawTopic : null) ||
      (topicLooksLikeQuestion ? rawTopic : null);
    const topicSummary =
      resolvedQuestion ||
      (rawTopic && rawTopic !== "Свой вопрос" ? rawTopic : "") ||
      topicFromIntention;

    const matrixBirth =
      typeof r.matrix_birth_date === "string"
        ? r.matrix_birth_date.slice(0, 10)
        : r.matrix_birth_date
          ? `${r.matrix_birth_date.getUTCFullYear()}-${String(r.matrix_birth_date.getUTCMonth() + 1).padStart(2, "0")}-${String(r.matrix_birth_date.getUTCDate()).padStart(2, "0")}`
          : null;

    return {
      id: r.id,
      sessionId: r.session_id,
      characterKey: r.character_key,
      sessionDate: r.session_date.toISOString(),
      createdAt: r.created_at.toISOString(),
      topicSummary,
      customQuestion: resolvedQuestion,
      intention: r.intention,
      spreadId: r.spread_id,
      spreadType: r.spread_type,
      keyCards,
      prediction,
      mood: r.mood,
      outcomeRating: r.outcome_rating,
      matrixBirthDate: matrixBirth,
      matrixCalculationVersion: r.matrix_calculation_version ?? null,
      matrixStructuredData:
        r.matrix_structured_data && typeof r.matrix_structured_data === "object"
          ? (r.matrix_structured_data as Record<string, unknown>)
          : null,
      matrixSubjectName: r.matrix_subject_name?.trim() || null,
      matrixSubjectKind: r.matrix_subject_kind ?? null,
      hdChartId: r.hd_chart_id ?? null,
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
  const [stats, maxMasterSessions, daysWithUs, ritualStats, jointStats] = await Promise.all([
    getUserStats(userId, "veronika"),
    maxSessionsWithOneMaster(userId),
    getDaysWithUs(userId),
    getUserRitualAchievementStats(userId),
    getUserJointReadingAchievementStats(userId),
  ]);

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
        progressLabel = `${Math.min(stats.currentStreak, 7)}/7 дней подряд`;
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
        progress = daysWithUs;
        progressMax = 30;
        progressLabel = `${Math.min(daysWithUs, 30)}/30 дней`;
        break;
      case "ritual_first":
        progress = Math.min(ritualStats.totalCompleted, 1);
        progressMax = 1;
        progressLabel = ritualStats.totalCompleted >= 1 ? "1/1" : "0/1";
        break;
      case "ritual_elements":
        progress = ritualStats.distinctTypesCompleted;
        progressMax = 7;
        progressLabel = `${Math.min(ritualStats.distinctTypesCompleted, 7)}/7 видов`;
        break;
      case "ritual_full_moon":
        progress = ritualStats.hasFullMoonRitual ? 1 : 0;
        progressMax = 1;
        progressLabel = "Обряд в полнолуние";
        break;
      case "ritual_loyal":
        progress = ritualStats.maxWithOneMaster;
        progressMax = 5;
        progressLabel = `${Math.min(ritualStats.maxWithOneMaster, 5)}/5 обрядов`;
        break;
      case "joint_first":
        progress = Math.min(jointStats.totalCompleted, 1);
        progressMax = 1;
        progressLabel = jointStats.totalCompleted >= 1 ? "1/1" : "0/1";
        break;
      case "joint_loyal":
        progress = jointStats.maxWithOnePartner;
        progressMax = 3;
        progressLabel = `${Math.min(jointStats.maxWithOnePartner, 3)}/3 раскладов`;
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

async function deleteSessionWithMatrixWipe(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || session.user_id !== userId) return false;

  const {
    isDestinyMatrixSession,
    wipeMatrixOwnershipForSession,
    purgeMatrixConsultationSessions,
  } = await import("@/lib/numerology/matrix-session-cleanup");

  if (isDestinyMatrixSession(session)) {
    const { rows: profileRows } = await query<{ birth_date: string | null }>(
      `SELECT birth_date::text AS birth_date FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    await wipeMatrixOwnershipForSession({
      userId,
      sessionId,
      profileBirthDate: profileRows[0]?.birth_date ?? null,
      isMatrixSession: true,
    });
  }

  const ok = await deleteConsultationSession(sessionId, userId);
  if (isDestinyMatrixSession(session)) {
    await purgeMatrixConsultationSessions(userId, [sessionId]);
  }
  return ok;
}

/** Delete cabinet session entry with full sync (chat, sessions, history, matrix ownership). */
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
    const ok = await deleteSessionWithMatrixWipe(userId, row.session_id);
    return { ok, characterKey: row.character_key };
  }

  if (row) {
    await query(`DELETE FROM session_memories WHERE id = $1 AND user_id = $2`, [memoryId, userId]);
    return { ok: true, characterKey: row.character_key };
  }

  const session = await getSession(memoryId);
  if (session?.user_id === userId && session.character_key) {
    const ok = await deleteSessionWithMatrixWipe(userId, memoryId);
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
    await run(`DELETE FROM numerology_report_history WHERE user_id = $1`, [userId]);

    // Persist lifetime guest intro + daily cooldown anchors BEFORE wiping sessions.
    await preserveUserRateLimitsBeforePurge(userId, client);

    const dailyReadingsRemoved = await run(`DELETE FROM daily_readings WHERE user_id = $1`, [userId]);
    const historyRemoved = await run(`DELETE FROM history WHERE user_id = $1`, [userId]);

    const chatMessagesRemoved = await run(
      `DELETE FROM chat_messages cm
       WHERE cm.owner_user_id = $1
          OR cm.session_id IN (SELECT id FROM sessions WHERE user_id = $1)`,
      [userId]
    );

    // Lifetime entitlement lives in astro_meta.guestIntroUsedAt — guest intro
    // session rows (cards/question/token) must not survive an irreversible purge.
    const sessionsRemoved = await run(
      `DELETE FROM sessions s
       WHERE s.user_id = $1
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.session_id = s.id)`,
      [userId]
    );

    // Payment-linked rows cannot be deleted: strip all personal payload, including
    // guest resume content/token metadata.
    const sessionsCleared = await run(
      `UPDATE sessions
       SET character_key = NULL,
           intention = NULL,
           spread_type = NULL,
           spread_id = NULL,
           cards = NULL,
           awaiting_context = FALSE,
           status = 'completed',
           free_questions_used = 0,
           guest_resume_token_hash = NULL,
           guest_resume_fingerprint = NULL,
           guest_resume_reading_id = NULL,
           guest_resume_expires_at = NULL,
           updated_at = NOW()
       WHERE user_id = $1
         AND EXISTS (SELECT 1 FROM payments p WHERE p.session_id = sessions.id)`,
      [userId]
    );

    await preservePermanentGrants(userId, client);

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
