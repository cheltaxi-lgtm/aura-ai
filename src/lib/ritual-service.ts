import { query } from "@/lib/db";
import { completeChat } from "@/lib/llm";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import {
  buildRitualPrompt,
  buildRitualSchemaRetryHint,
  parseRitualJson,
  type RitualGeneratedContent,
} from "@/lib/ritual-prompt";
import {
  computeRitualSchedule,
  resolveRitualTimeDisplay,
} from "@/lib/ritual-timing";
import { resolveWordOfPowerTranscription } from "@/lib/word-of-power-transcription";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";

export type RitualStatus =
  | "questions"
  | "spread"
  | "payment"
  | "generating"
  | "completed"
  | "reviewed";

export interface RitualCard {
  name: string;
  position: string;
}

export interface RitualRow {
  id: string;
  user_id: string;
  character_key: string;
  ritual_type: RitualType;
  status: RitualStatus;
  answers: string[];
  cards: RitualCard[];
  moon_phase: string | null;
  moon_sign: string | null;
  ritual_time: string | null;
  ritual_place: string | null;
  ritual_items: Array<{ item: string; reason: string }>;
  ritual_steps: Array<{ step: string; description: string }>;
  ritual_words: string | null;
  ritual_word_of_power: string | null;
  ritual_word_of_power_transcription: string | null;
  ritual_forbids: string[];
  ritual_signs: string[];
  rune_cost: number;
  payment_status: string;
  transaction_id: string | null;
  outcome_text: string | null;
  outcome_rating: number | null;
  outcome_shared: boolean;
  remind_at: Date | null;
  reminded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRitualRow(row: Record<string, unknown>): RitualRow {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    character_key: String(row.character_key),
    ritual_type: row.ritual_type as RitualType,
    status: row.status as RitualStatus,
    answers: Array.isArray(row.answers) ? (row.answers as string[]) : [],
    cards: Array.isArray(row.cards) ? (row.cards as RitualCard[]) : [],
    moon_phase: row.moon_phase ? String(row.moon_phase) : null,
    moon_sign: row.moon_sign ? String(row.moon_sign) : null,
    ritual_time: row.ritual_time ? String(row.ritual_time) : null,
    ritual_place: row.ritual_place ? String(row.ritual_place) : null,
    ritual_items: Array.isArray(row.ritual_items)
      ? (row.ritual_items as Array<{ item: string; reason: string }>)
      : [],
    ritual_steps: Array.isArray(row.ritual_steps)
      ? (row.ritual_steps as Array<{ step: string; description: string }>)
      : [],
    ritual_words: row.ritual_words ? String(row.ritual_words) : null,
    ritual_word_of_power: row.ritual_word_of_power
      ? String(row.ritual_word_of_power)
      : null,
    ritual_word_of_power_transcription: row.ritual_word_of_power_transcription
      ? String(row.ritual_word_of_power_transcription)
      : null,
    ritual_forbids: Array.isArray(row.ritual_forbids)
      ? (row.ritual_forbids as string[])
      : [],
    ritual_signs: Array.isArray(row.ritual_signs)
      ? (row.ritual_signs as string[])
      : [],
    rune_cost: Number(row.rune_cost ?? 0),
    payment_status: String(row.payment_status ?? "pending"),
    transaction_id: row.transaction_id ? String(row.transaction_id) : null,
    outcome_text: row.outcome_text ? String(row.outcome_text) : null,
    outcome_rating:
      row.outcome_rating != null ? Number(row.outcome_rating) : null,
    outcome_shared: Boolean(row.outcome_shared),
    remind_at: row.remind_at ? new Date(String(row.remind_at)) : null,
    reminded_at: row.reminded_at ? new Date(String(row.reminded_at)) : null,
    created_at: new Date(String(row.created_at)),
    updated_at: new Date(String(row.updated_at)),
  };
}

export async function createRitual(params: {
  userId: string;
  characterKey: string;
  ritualType: RitualType;
  moonPhase: string;
  moonSign: string;
  runeCost: number;
}): Promise<RitualRow> {
  const { rows } = await query<Record<string, unknown>>(
    `INSERT INTO rituals
       (user_id, character_key, ritual_type, moon_phase, moon_sign, rune_cost)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      params.userId,
      params.characterKey,
      params.ritualType,
      params.moonPhase,
      params.moonSign,
      params.runeCost,
    ]
  );
  return mapRitualRow(rows[0]);
}

export async function getRitualById(id: string): Promise<RitualRow | null> {
  const { rows } = await query<Record<string, unknown>>(
    "SELECT * FROM rituals WHERE id = $1",
    [id]
  );
  return rows[0] ? mapRitualRow(rows[0]) : null;
}

export async function deleteRitualById(
  id: string,
  userId: string
): Promise<boolean> {
  const { rowCount } = await query(
    `DELETE FROM rituals WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function listUserRituals(
  userId: string,
  opts?: { characterKey?: string; status?: RitualStatus }
): Promise<RitualRow[]> {
  const params: unknown[] = [userId];
  let sql = `SELECT * FROM rituals WHERE user_id = $1`;
  if (opts?.characterKey) {
    params.push(opts.characterKey);
    sql += ` AND character_key = $${params.length}`;
  }
  if (opts?.status) {
    params.push(opts.status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT 50`;
  const { rows } = await query<Record<string, unknown>>(sql, params);
  return rows.map(mapRitualRow);
}

export interface CabinetRitualStats {
  total: number;
  completed: number;
  signsNoted: number;
  pendingReview: number;
  inProgress: number;
  loveCount: number;
  moneyCount: number;
  protectionCount: number;
  luckCount: number;
  releaseCount: number;
  healthCount: number;
  careerCount: number;
}

export async function getCabinetRitualStats(
  userId: string
): Promise<CabinetRitualStats> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN ('completed', 'reviewed'))::int AS completed,
       COUNT(*) FILTER (WHERE status = 'reviewed' AND outcome_rating >= 3)::int AS signs_noted,
       COUNT(*) FILTER (
         WHERE status = 'completed'
           AND remind_at IS NOT NULL
           AND remind_at <= NOW()
           AND outcome_rating IS NULL
       )::int AS pending_review,
       COUNT(*) FILTER (WHERE status IN ('questions', 'spread', 'payment', 'generating'))::int AS in_progress,
       COUNT(*) FILTER (WHERE ritual_type = 'love')::int AS love_count,
       COUNT(*) FILTER (WHERE ritual_type = 'money')::int AS money_count,
       COUNT(*) FILTER (WHERE ritual_type = 'protection')::int AS protection_count,
       COUNT(*) FILTER (WHERE ritual_type = 'luck')::int AS luck_count,
       COUNT(*) FILTER (WHERE ritual_type = 'release')::int AS release_count,
       COUNT(*) FILTER (WHERE ritual_type = 'health')::int AS health_count,
       COUNT(*) FILTER (WHERE ritual_type = 'career')::int AS career_count
     FROM rituals
     WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    completed: Number(row.completed ?? 0),
    signsNoted: Number(row.signs_noted ?? 0),
    pendingReview: Number(row.pending_review ?? 0),
    inProgress: Number(row.in_progress ?? 0),
    loveCount: Number(row.love_count ?? 0),
    moneyCount: Number(row.money_count ?? 0),
    protectionCount: Number(row.protection_count ?? 0),
    luckCount: Number(row.luck_count ?? 0),
    releaseCount: Number(row.release_count ?? 0),
    healthCount: Number(row.health_count ?? 0),
    careerCount: Number(row.career_count ?? 0),
  };
}

export async function appendRitualAnswer(
  id: string,
  answers: string[],
  newStatus?: RitualStatus
): Promise<RitualRow | null> {
  const { rows } = await query<Record<string, unknown>>(
    newStatus
      ? `UPDATE rituals
         SET answers = $2::jsonb, status = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING *`
      : `UPDATE rituals
         SET answers = $2::jsonb, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
    newStatus
      ? [id, JSON.stringify(answers), newStatus]
      : [id, JSON.stringify(answers)]
  );
  return rows[0] ? mapRitualRow(rows[0]) : null;
}

export async function saveRitualCards(
  id: string,
  cards: RitualCard[]
): Promise<RitualRow | null> {
  const { rows } = await query<Record<string, unknown>>(
    `UPDATE rituals
     SET cards = $2::jsonb, status = 'payment', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, JSON.stringify(cards)]
  );
  return rows[0] ? mapRitualRow(rows[0]) : null;
}

export async function markRitualPaidAndGenerating(
  id: string,
  opts?: { paymentStatus?: "paid" | "free"; transactionId?: string | null }
): Promise<RitualRow | null> {
  const paymentStatus = opts?.paymentStatus ?? "paid";
  // Atomic claim: only transition from payment → generating (prevents double-pay races).
  const { rows } = await query<Record<string, unknown>>(
    `UPDATE rituals
     SET payment_status = $2, transaction_id = $3, status = 'generating', updated_at = NOW()
     WHERE id = $1 AND status = 'payment'
     RETURNING *`,
    [id, paymentStatus, opts?.transactionId ?? null]
  );
  return rows[0] ? mapRitualRow(rows[0]) : null;
}

export async function markRitualGenerationFailed(id: string): Promise<void> {
  await query(
    `UPDATE rituals
     SET status = 'payment', payment_status = 'pending', updated_at = NOW()
     WHERE id = $1 AND status = 'generating'`,
    [id]
  );
}

/** Rituals stuck in `generating` (e.g. after server restart). */
export async function listStuckGeneratingRituals(
  olderThanMinutes = 15
): Promise<RitualRow[]> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT * FROM rituals
     WHERE status = 'generating'
       AND payment_status IN ('paid', 'free')
       AND updated_at < NOW() - ($1 || ' minutes')::interval
     ORDER BY updated_at ASC
     LIMIT 50`,
    [String(Math.max(5, olderThanMinutes))]
  );
  return rows.map(mapRitualRow);
}

export async function attemptRitualGeneration(
  ritualId: string,
  userProfile: { name: string; zodiac: string }
): Promise<RitualRow | null> {
  const ritual = await getRitualById(ritualId);
  if (!ritual) return null;
  if (ritual.status === "completed" || ritual.status === "reviewed") return ritual;
  if (ritual.status !== "generating") return null;
  const generated = await generateRitualContent(ritual, userProfile);
  if (generated) return generated;
  // Concurrent generator may have completed first — treat as success if done.
  const latest = await getRitualById(ritualId);
  if (latest && (latest.status === "completed" || latest.status === "reviewed")) {
    return latest;
  }
  return null;
}

export async function saveGeneratedRitual(
  id: string,
  content: RitualGeneratedContent
): Promise<RitualRow | null> {
  const remindAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await query<Record<string, unknown>>(
    `UPDATE rituals SET
       status = 'completed',
       ritual_time = $2,
       ritual_place = $3,
       ritual_items = $4::jsonb,
       ritual_steps = $5::jsonb,
       ritual_words = $6,
       ritual_word_of_power = $7,
       ritual_word_of_power_transcription = $8,
       ritual_forbids = $9::jsonb,
       ritual_signs = $10::jsonb,
       remind_at = $11,
       updated_at = NOW()
     WHERE id = $1 AND status = 'generating'
     RETURNING *`,
    [
      id,
      content.ritual_time,
      content.ritual_place,
      JSON.stringify(content.ritual_items),
      JSON.stringify(content.ritual_steps),
      content.ritual_words,
      content.ritual_word_of_power,
      content.ritual_word_of_power_transcription || null,
      JSON.stringify(content.ritual_forbids),
      JSON.stringify(content.ritual_signs),
      remindAt,
    ]
  );
  return rows[0] ? mapRitualRow(rows[0]) : null;
}

export interface UserRitualAchievementStats {
  totalCompleted: number;
  distinctTypesCompleted: number;
  maxWithOneMaster: number;
  hasFullMoonRitual: boolean;
}

export async function getUserRitualAchievementStats(
  userId: string
): Promise<UserRitualAchievementStats> {
  const { rows } = await query<{
    total_completed: string;
    distinct_types: string;
    max_with_one_master: string;
    has_full_moon: boolean;
  }>(
    `WITH done AS (
       SELECT ritual_type, character_key, moon_phase
       FROM rituals
       WHERE user_id = $1 AND status IN ('completed', 'reviewed')
     )
     SELECT
       (SELECT COUNT(*) FROM done)::text AS total_completed,
       (SELECT COUNT(DISTINCT ritual_type) FROM done)::text AS distinct_types,
       (SELECT COALESCE(MAX(c), 0) FROM (
          SELECT COUNT(*) AS c FROM done GROUP BY character_key
        ) sub)::text AS max_with_one_master,
       EXISTS(SELECT 1 FROM done WHERE moon_phase = 'Полнолуние') AS has_full_moon`,
    [userId]
  );
  const row = rows[0];
  return {
    totalCompleted: Number(row?.total_completed ?? 0),
    distinctTypesCompleted: Number(row?.distinct_types ?? 0),
    maxWithOneMaster: Number(row?.max_with_one_master ?? 0),
    hasFullMoonRitual: Boolean(row?.has_full_moon),
  };
}

export async function getRitualStats(
  ritualType: string,
  characterKey: string
): Promise<{ total: number; signsReported: number; percentage: number }> {
  const { rows } = await query<{ total: string; signs_reported: string }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE outcome_rating >= 3)::text AS signs_reported
     FROM ritual_outcomes_public
     WHERE ritual_type = $1 AND character_key = $2`,
    [ritualType, characterKey]
  );
  const total = Number(rows[0]?.total ?? 0);
  const signsReported = Number(rows[0]?.signs_reported ?? 0);
  const percentage = total > 0 ? Math.round((signsReported / total) * 100) : 0;
  return { total, signsReported, percentage };
}

export interface PublicRitualOutcome {
  ritualType: RitualType;
  characterKey: string;
  outcomeText: string;
  outcomeRating: number;
  createdAt: string;
}

/** Recent well-rated anonymous outcomes for social proof on /obryady. */
export async function listPublicRitualOutcomes(
  limit = 6,
  ritualType?: RitualType
): Promise<PublicRitualOutcome[]> {
  const params: unknown[] = [Math.max(1, Math.min(20, limit))];
  let sql = `SELECT ritual_type, character_key, outcome_text, outcome_rating, created_at
     FROM ritual_outcomes_public
     WHERE outcome_rating >= 4 AND LENGTH(outcome_text) >= 12`;
  if (ritualType) {
    params.push(ritualType);
    sql += ` AND ritual_type = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT $1`;
  const { rows } = await query<{
    ritual_type: RitualType;
    character_key: string;
    outcome_text: string;
    outcome_rating: number;
    created_at: Date;
  }>(sql, params);
  return rows.map((r) => ({
    ritualType: r.ritual_type,
    characterKey: r.character_key,
    outcomeText: r.outcome_text,
    outcomeRating: r.outcome_rating,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

export async function submitRitualReview(
  id: string,
  params: {
    outcomeText?: string;
    outcomeRating: number;
    sharePublicly?: boolean;
  }
): Promise<boolean> {
  const ritual = await getRitualById(id);
  if (!ritual) return false;
  if (ritual.status !== "completed" && ritual.status !== "reviewed") {
    return false;
  }

  const outcomeText = params.outcomeText?.trim().slice(0, 500) || null;
  const sharePublicly = Boolean(params.sharePublicly && outcomeText);

  await query(
    `UPDATE rituals SET
       outcome_text = $2,
       outcome_rating = $3,
       outcome_shared = $4,
       status = 'reviewed',
       updated_at = NOW()
     WHERE id = $1 AND status IN ('completed', 'reviewed')`,
    [id, outcomeText, params.outcomeRating, sharePublicly || ritual.outcome_shared]
  );

  if (
    sharePublicly &&
    outcomeText &&
    outcomeText.length >= 12 &&
    !ritual.outcome_shared
  ) {
    await query(
      `INSERT INTO ritual_outcomes_public
         (ritual_type, character_key, outcome_text, outcome_rating)
       VALUES ($1, $2, $3, $4)`,
      [
        ritual.ritual_type,
        ritual.character_key,
        outcomeText,
        params.outcomeRating,
      ]
    );
  }

  return true;
}

export async function generateRitualContent(
  ritual: RitualRow,
  userProfile: { name: string; zodiac: string }
): Promise<RitualRow | null> {
  const referenceDate = ritual.created_at ?? new Date();
  const schedule = computeRitualSchedule(ritual.ritual_type, referenceDate);
  const prompt = buildRitualPrompt({
    characterKey: ritual.character_key,
    ritualType: ritual.ritual_type,
    userName: normalizePersonDisplayNameOr(userProfile.name, "друг"),
    userZodiac: userProfile.zodiac,
    answers: ritual.answers,
    cards: ritual.cards,
    moonPhase: ritual.moon_phase ?? "",
    moonSign: ritual.moon_sign ?? "",
    referenceDate,
    schedule,
  });

  const { wrapSystemPrompt } = await import("@/lib/prompt-policy");
  const systemPrompt = await wrapSystemPrompt(
    "Ты составляешь персональный ритуал Zovus по раскладу. Честность по символам обязательна; не смягчай тень карт. Ответ — строго JSON по инструкции пользователя."
  );

  const llmBase = {
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: prompt },
    ],
    maxTokens: 4096,
    temperature: 0.55,
    allowReasoningFallback: true,
    jsonObject: true,
    timeoutMs: 120_000,
    maxAttempts: 2,
  };

  let response = await completeChat(llmBase);

  if (!response) {
    const fallbackModel =
      process.env.RITUAL_LLM_MODEL?.trim() || "deepseek/deepseek-chat-v3-0324";
    console.warn("Ritual LLM primary failed, trying fallback:", fallbackModel);
    response = await completeChat({
      ...llmBase,
      modelOverride: fallbackModel,
      allowReasoningFallback: false,
      temperature: 0.45,
    });
  }

  if (!response) return null;

  let parsed = parseRitualJson(response, schedule);
  if (!parsed) {
    console.warn("Ritual JSON schema soft-fail, retrying once");
    const retryResponse = await completeChat({
      ...llmBase,
      temperature: 0.35,
      maxAttempts: 1,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: prompt },
        { role: "assistant" as const, content: response },
        { role: "user" as const, content: buildRitualSchemaRetryHint(response) },
      ],
    });
    if (retryResponse) {
      parsed = parseRitualJson(retryResponse, schedule);
    }
  }

  if (!parsed) return null;

  return saveGeneratedRitual(ritual.id, parsed);
}

export function getQuestionsForRitual(ritualType: RitualType): string[] {
  return [...RITUAL_TYPES[ritualType].questions];
}

export async function getDueReminders(): Promise<
  Array<{
    id: string;
    user_id: string;
    character_key: string;
    ritual_type: string;
  }>
> {
  const { rows } = await query<{
    id: string;
    user_id: string;
    character_key: string;
    ritual_type: string;
  }>(
    `SELECT id, user_id, character_key, ritual_type
     FROM rituals
     WHERE status = 'completed'
       AND remind_at <= NOW()
       AND reminded_at IS NULL`
  );
  return rows;
}

export async function markRitualReminded(id: string): Promise<void> {
  await query(
    `UPDATE rituals SET reminded_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      params.userId,
      params.type,
      params.title,
      params.body,
      JSON.stringify(params.data ?? {}),
    ]
  );
}

export async function getUnreadNotifications(userId: string) {
  const { rows } = await query<{
    id: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, type, title, body, data, created_at
     FROM notifications
     WHERE user_id = $1 AND read = FALSE
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId]
  );
  return rows;
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await query(
    `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
    [userId]
  );
}

export type RitualAdminStatus = RitualStatus;

export interface RitualAdminStats {
  total: number;
  byStatus: Record<RitualAdminStatus, number>;
  stuckGenerating: number;
  completionRate: number;
  reviewRate: number;
  freeShare: number;
}

export async function getRitualAdminStats(): Promise<RitualAdminStats> {
  const { rows } = await query<{ status: RitualStatus; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM rituals GROUP BY status`
  );
  const byStatus: Record<RitualAdminStatus, number> = {
    questions: 0,
    spread: 0,
    payment: 0,
    generating: 0,
    completed: 0,
    reviewed: 0,
  };
  let total = 0;
  for (const row of rows) {
    const count = Number(row.count) || 0;
    if (row.status in byStatus) byStatus[row.status] = count;
    total += count;
  }

  const { rows: stuckRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM rituals
     WHERE status = 'generating'
       AND payment_status IN ('paid', 'free')
       AND updated_at < NOW() - INTERVAL '15 minutes'`
  );
  const stuckGenerating = Number(stuckRows[0]?.count ?? 0);

  const { rows: freeRows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM rituals
     WHERE payment_status = 'free'
       AND status IN ('completed', 'reviewed', 'generating')`
  );
  const freeShare = Number(freeRows[0]?.count ?? 0);

  const finished = byStatus.completed + byStatus.reviewed;
  const completionRate =
    total > 0 ? Math.round((finished / total) * 1000) / 10 : 0;
  const reviewRate =
    finished > 0 ? Math.round((byStatus.reviewed / finished) * 1000) / 10 : 0;

  return {
    total,
    byStatus,
    stuckGenerating,
    completionRate,
    reviewRate,
    freeShare,
  };
}

export interface RitualAdminListItem {
  id: string;
  ritualType: RitualType;
  characterKey: string;
  status: RitualStatus;
  paymentStatus: string;
  runeCost: number;
  createdAt: string;
  updatedAt: string;
}

export async function listRecentRitualsForAdmin(
  limit = 30
): Promise<RitualAdminListItem[]> {
  const { rows } = await query<{
    id: string;
    ritual_type: RitualType;
    character_key: string;
    status: RitualStatus;
    payment_status: string;
    rune_cost: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, ritual_type, character_key, status, payment_status, rune_cost, created_at, updated_at
     FROM rituals
     ORDER BY created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(100, limit))]
  );
  return rows.map((r) => ({
    id: r.id,
    ritualType: r.ritual_type,
    characterKey: r.character_key,
    status: r.status,
    paymentStatus: r.payment_status,
    runeCost: Number(r.rune_cost) || 0,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt:
      r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export function ritualToClient(ritual: RitualRow) {
  return {
    id: ritual.id,
    characterKey: ritual.character_key,
    ritualType: ritual.ritual_type,
    status: ritual.status,
    answers: ritual.answers,
    cards: ritual.cards,
    moonPhase: ritual.moon_phase,
    moonSign: ritual.moon_sign,
    ritualTime: resolveRitualTimeDisplay(
      ritual.ritual_type,
      ritual.ritual_time,
      ritual.created_at
    ),
    ritualPlace: ritual.ritual_place,
    ritualItems: ritual.ritual_items,
    ritualSteps: ritual.ritual_steps,
    ritualWords: ritual.ritual_words,
    ritualWordOfPower: ritual.ritual_word_of_power,
    ritualWordOfPowerTranscription: resolveWordOfPowerTranscription(
      ritual.ritual_word_of_power,
      ritual.ritual_word_of_power_transcription
    ),
    ritualForbids: ritual.ritual_forbids,
    ritualSigns: ritual.ritual_signs,
    runeCost: ritual.rune_cost,
    paymentStatus: ritual.payment_status,
    outcomeText: ritual.outcome_text,
    outcomeRating: ritual.outcome_rating,
    outcomeShared: ritual.outcome_shared,
    remindAt: ritual.remind_at?.toISOString() ?? null,
    remindedAt: ritual.reminded_at?.toISOString() ?? null,
    hasCard: Boolean(ritual.ritual_time),
    createdAt: ritual.created_at.toISOString(),
    updatedAt: ritual.updated_at.toISOString(),
  };
}
