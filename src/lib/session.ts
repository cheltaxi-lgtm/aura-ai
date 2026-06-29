import { query, queryClient, type PoolClient } from "./db";
import { LLM_CONTEXT_MESSAGES } from "./chat-limits";
import { getRuneSettings } from "./rune-settings";
import { getSetting } from "./settings";
import { creditRunesToUser } from "./rune-service";
import { deleteUserTripletForSession } from "./triplet-cleanup";
import type { NumerologToolParams } from "@/lib/numerology/tools";

export interface SessionRow {
  id: string;
  user_id: string | null;
  referrer_slug: string | null;
  free_questions_used: number;
  paid_until: Date | null;
  has_single_unlock: boolean;
  awaiting_context?: boolean;
  character_key?: string | null;
  intention?: string | null;
  spread_type?: string | null;
  spread_id?: string | null;
  cards?: string[] | null;
  numerolog_tool_params?: NumerologToolParams | null;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface SessionChatMeta {
  id: string;
  character_key: string | null;
  intention: string | null;
  spread_type: string | null;
  spread_id: string | null;
  cards: string[] | null;
  numerolog_tool_params?: NumerologToolParams | null;
  awaiting_context?: boolean;
}

const SESSION_SELECT_FIELDS = `
  id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock,
  COALESCE(awaiting_context, false) AS awaiting_context,
  character_key, intention, spread_type, spread_id, cards, numerolog_tool_params,
  COALESCE(status, 'active') AS status, created_at, updated_at
`;

function parseNumerologToolParams(raw: unknown): NumerologToolParams | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const partnerName = typeof o.partnerName === "string" ? o.partnerName.trim() : "";
  const partnerDate = typeof o.partnerDate === "string" ? o.partnerDate.trim() : "";
  const objectValue = typeof o.objectValue === "string" ? o.objectValue.trim() : "";
  if (!partnerName && !partnerDate && !objectValue) return null;
  return {
    ...(partnerName ? { partnerName } : {}),
    ...(partnerDate ? { partnerDate } : {}),
    ...(objectValue ? { objectValue } : {}),
  };
}

function parseSessionCards(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const names = raw
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim());
    return names.length ? names : null;
  }
  return null;
}

function mapSessionChatMeta(row: {
  id: string;
  character_key?: string | null;
  intention?: string | null;
  spread_type?: string | null;
  spread_id?: string | null;
  cards?: unknown;
  numerolog_tool_params?: unknown;
  awaiting_context?: boolean;
}): SessionChatMeta {
  return {
    id: row.id,
    character_key: row.character_key ?? null,
    intention: row.intention ?? null,
    spread_type: row.spread_type ?? null,
    spread_id: row.spread_id ?? null,
    cards: parseSessionCards(row.cards),
    numerolog_tool_params: parseNumerologToolParams(row.numerolog_tool_params),
    awaiting_context: row.awaiting_context,
  };
}

export const FREE_QUESTION_LIMIT = 2;

/** Admin-configured free question limit (runes settings). */
export async function getFreeQuestionLimit(): Promise<number> {
  try {
    const settings = await getRuneSettings();
    return Math.max(0, settings.freeQuestions);
  } catch {
    return FREE_QUESTION_LIMIT;
  }
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const { rows } = await query<SessionRow & { cards?: unknown }>(
    `SELECT ${SESSION_SELECT_FIELDS} FROM sessions WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    cards: parseSessionCards(row.cards),
    numerolog_tool_params: parseNumerologToolParams(row.numerolog_tool_params),
  };
}

export async function updateSessionReferrer(
  sessionId: string,
  referrerSlug: string | null
): Promise<SessionRow | null> {
  const { rows } = await query<SessionRow>(
    `UPDATE sessions SET referrer_slug = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock`,
    [sessionId, referrerSlug]
  );
  return rows[0] ?? null;
}

export async function createSession(
  referrerSlug?: string,
  userId?: string,
  influencerToken?: string
): Promise<SessionRow> {
  let safeUserId: string | null = null;
  if (userId) {
    const { rows: userRows } = await query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );
    safeUserId = userRows[0]?.id ?? null;
  }

  const { rows } = await query<SessionRow>(
    `INSERT INTO sessions (referrer_slug, user_id, influencer_token)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock, COALESCE(awaiting_context, false) AS awaiting_context`,
    [referrerSlug ?? null, safeUserId, influencerToken ?? null]
  );
  return rows[0];
}

export async function setSessionAwaitingContext(
  sessionId: string,
  awaiting: boolean
): Promise<void> {
  await query(
    `UPDATE sessions SET awaiting_context = $2, updated_at = NOW() WHERE id = $1`,
    [sessionId, awaiting]
  );
}

export async function getSessionChatMeta(sessionId: string): Promise<SessionChatMeta | null> {
  const { rows } = await query<{
    id: string;
    character_key: string | null;
    intention: string | null;
    spread_type: string | null;
    cards: unknown;
    awaiting_context: boolean;
  }>(
    `SELECT id, character_key, intention, spread_type, spread_id, cards,
            COALESCE(awaiting_context, false) AS awaiting_context
     FROM sessions WHERE id = $1`,
    [sessionId]
  );
  return rows[0] ? mapSessionChatMeta(rows[0]) : null;
}

export async function findLatestSessionMetaForCharacter(
  userId: string,
  characterId: string
): Promise<SessionChatMeta | null> {
  const { rows } = await query<{
    id: string;
    character_key: string | null;
    intention: string | null;
    spread_type: string | null;
    cards: unknown;
    awaiting_context: boolean;
  }>(
    `SELECT id, character_key, intention, spread_type, spread_id, cards,
            COALESCE(awaiting_context, false) AS awaiting_context
     FROM sessions
     WHERE user_id = $1
       AND character_key = $2
       AND COALESCE(status, 'active') = 'active'
       AND (intention IS NOT NULL OR cards IS NOT NULL)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId, characterId]
  );
  return rows[0] ? mapSessionChatMeta(rows[0]) : null;
}

export async function updateSessionChatMeta(
  sessionId: string,
  meta: {
    characterKey?: string;
    intention?: string | null;
    spreadType?: string | null;
    spreadId?: string | null;
    cards?: string[] | null;
    numerologToolParams?: NumerologToolParams | null;
  }
): Promise<void> {
  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [sessionId];
  let idx = 2;

  if (meta.characterKey !== undefined) {
    sets.push(`character_key = $${idx++}`);
    params.push(meta.characterKey);
  }
  if (meta.intention !== undefined) {
    sets.push(`intention = $${idx++}`);
    params.push(meta.intention);
  }
  if (meta.spreadType !== undefined) {
    sets.push(`spread_type = $${idx++}`);
    params.push(meta.spreadType);
  }
  if (meta.spreadId !== undefined) {
    sets.push(`spread_id = $${idx++}`);
    params.push(meta.spreadId);
  }
  if (meta.cards !== undefined) {
    sets.push(`cards = $${idx++}::jsonb`);
    params.push(meta.cards?.length ? JSON.stringify(meta.cards) : null);
  }
  if (meta.numerologToolParams !== undefined) {
    sets.push(`numerolog_tool_params = $${idx++}::jsonb`);
    params.push(
      meta.numerologToolParams && Object.keys(meta.numerologToolParams).length
        ? JSON.stringify(meta.numerologToolParams)
        : null
    );
  }

  if (
    meta.characterKey !== undefined ||
    meta.intention !== undefined ||
    meta.spreadType !== undefined ||
    meta.spreadId !== undefined ||
    meta.cards !== undefined ||
    meta.numerologToolParams !== undefined
  ) {
    sets.push(`status = 'active'`);
  }

  if (sets.length === 1) return;

  await query(`UPDATE sessions SET ${sets.join(", ")} WHERE id = $1`, params);
}

export function hasPaidAccess(session: SessionRow, opts?: { unlimited?: boolean }): boolean {
  if (opts?.unlimited) return true;
  if (session.has_single_unlock) return true;
  if (session.paid_until && new Date(session.paid_until) > new Date()) return true;
  return false;
}

/** @deprecated use hasPaidAccess / canSendChatMessage */
export function sessionHasAccess(session: SessionRow, opts?: { unlimited?: boolean }): boolean {
  return hasPaidAccess(session, opts) || session.free_questions_used < FREE_QUESTION_LIMIT;
}

export function canSendChatMessage(
  session: SessionRow,
  opts?: { unlimited?: boolean; limit?: number }
): boolean {
  if (hasPaidAccess(session, opts)) return true;
  const limit = opts?.limit ?? FREE_QUESTION_LIMIT;
  return session.free_questions_used < limit;
}

export function questionsRemaining(
  session: SessionRow,
  opts?: { unlimited?: boolean; limit?: number }
): number | null {
  if (hasPaidAccess(session, opts)) return null;
  const limit = opts?.limit ?? FREE_QUESTION_LIMIT;
  return Math.max(0, limit - session.free_questions_used);
}

/** Atomically reserve a question slot; null = paywall. */
export async function reserveQuestionSlot(
  sessionId: string,
  limit: number,
  hasAccess: boolean,
  client?: PoolClient
): Promise<number | null> {
  const run = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(client, text, params)
    : query;

  if (hasAccess) {
    const count = await incrementQuestionCount(sessionId, client);
    return count;
  }

  const { rows } = await run<{ free_questions_used: number }>(
    `UPDATE sessions SET free_questions_used = free_questions_used + 1, updated_at = NOW()
     WHERE id = $1 AND free_questions_used < $2
     RETURNING free_questions_used`,
    [sessionId, limit]
  );
  return rows[0]?.free_questions_used ?? null;
}

export async function decrementQuestionCount(sessionId: string, client?: PoolClient): Promise<void> {
  const run = client
    ? (text: string, params?: unknown[]) => queryClient(client, text, params)
    : query;
  await run(
    `UPDATE sessions SET free_questions_used = GREATEST(0, free_questions_used - 1), updated_at = NOW()
     WHERE id = $1`,
    [sessionId]
  );
}

export async function incrementQuestionCount(sessionId: string, client?: PoolClient): Promise<number> {
  const run = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(client, text, params)
    : query;
  const { rows } = await run<{ free_questions_used: number }>(
    `UPDATE sessions SET free_questions_used = free_questions_used + 1, updated_at = NOW()
     WHERE id = $1 RETURNING free_questions_used`,
    [sessionId]
  );
  return rows[0]?.free_questions_used ?? 0;
}

export async function unlockSingleSession(sessionId: string) {
  await query(
    "UPDATE sessions SET has_single_unlock = TRUE, updated_at = NOW() WHERE id = $1",
    [sessionId]
  );
}

export async function unlockSubscription(sessionId: string, days = 30) {
  await query(
    `UPDATE sessions SET paid_until = GREATEST(COALESCE(paid_until, NOW()), NOW()) + ($2 || ' days')::INTERVAL,
     has_single_unlock = TRUE, updated_at = NOW() WHERE id = $1`,
    [sessionId, String(days)]
  );

  const runeSettings = await getRuneSettings();
  if (runeSettings.enabled) {
    const session = await getSession(sessionId);
    if (session?.user_id) {
      const pricing = await getSetting("pricing");
      const rubPerRune = Math.max(0.1, runeSettings.rubPerRune);
      const runeEquivalent = Math.floor(pricing.subscriptionPrice / rubPerRune);
      if (runeEquivalent > 0) {
        await creditRunesToUser(
          session.user_id,
          runeEquivalent,
          "bonus",
          `Подписка ${days} дней — эквивалент рун`
        );
      }
    }
  }
}

export async function saveMessage(
  sessionId: string,
  characterId: string,
  role: "user" | "assistant",
  content: string,
  ownerUserId?: string | null
) {
  await query(
    `INSERT INTO chat_messages (session_id, character_id, role, content, owner_user_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, characterId, role, content, ownerUserId ?? null]
  );
  console.log(`[DB_CHAT_SAVE_SUCCESS] Saved message for master: ${characterId}`);
}

export async function getMessages(sessionId: string, characterId: string) {
  const { rows } = await query<{ role: string; content: string; created_at: Date }>(
    `SELECT role, content, created_at FROM chat_messages
     WHERE session_id = $1 AND character_id = $2 ORDER BY created_at ASC`,
    [sessionId, characterId]
  );
  return rows;
}

/** Last N messages for LLM context — scoped to one billing session + character. */
export async function getSessionMessagesForLlm(
  sessionId: string,
  characterId: string,
  limit: number = LLM_CONTEXT_MESSAGES
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { rows } = await query<{ role: "user" | "assistant"; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE session_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [sessionId, characterId, limit]
  );
  return rows.reverse();
}

export async function getBloggerBySlug(slug: string) {
  const { rows } = await query<{
    id: string;
    slug: string;
    display_name: string;
    title: string | null;
    split_percent: number;
    style_notes: string | null;
    emoji: string | null;
  }>(
    "SELECT id, slug, display_name, title, split_percent, style_notes, emoji FROM bloggers WHERE slug = $1 AND is_active = TRUE",
    [slug]
  );
  return rows[0] ?? null;
}

export async function getBloggerKnowledge(bloggerId: string): Promise<string> {
  const { rows } = await query<{ content: string }>(
    "SELECT content FROM blogger_knowledge WHERE blogger_id = $1 ORDER BY created_at DESC LIMIT 10",
    [bloggerId]
  );
  return rows.map((r) => r.content).join("\n\n");
}

export async function recordPayment(data: {
  sessionId: string;
  orderId?: string;
  yukassaPaymentId?: string;
  yoomoneyOperationId?: string;
  amount: number;
  paymentType: "single" | "subscription";
  referrerSlug?: string;
  bloggerSplitPercent?: number;
  influencerId?: string;
}) {
  const externalId = data.yukassaPaymentId ?? data.yoomoneyOperationId ?? data.orderId;
  const session = await getSession(data.sessionId);
  const userId = session?.user_id ?? null;

  await query(
    `INSERT INTO payments (session_id, user_id, order_id, yukassa_payment_id, yoomoney_operation_id, amount, payment_type, status, referrer_slug, blogger_split_percent, influencer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
     ON CONFLICT (order_id) DO NOTHING`,
    [
      data.sessionId,
      userId,
      data.orderId ?? externalId ?? null,
      data.yukassaPaymentId ?? null,
      data.yoomoneyOperationId ?? null,
      data.amount,
      data.paymentType,
      data.referrerSlug ?? null,
      data.bloggerSplitPercent ?? null,
      data.influencerId ?? null,
    ]
  );
}

export async function completePayment(yukassaPaymentId: string) {
  const { rows } = await query<{
    session_id: string;
    payment_type: "single" | "subscription";
    influencer_id: string | null;
    amount: string;
    blogger_split_percent: number | null;
  }>(
    `UPDATE payments SET status = 'succeeded', updated_at = NOW()
     WHERE yukassa_payment_id = $1 AND status = 'pending'
     RETURNING session_id, payment_type, influencer_id, amount::text, blogger_split_percent`,
    [yukassaPaymentId]
  );
  const payment = rows[0];
  if (!payment) return null;

  if (payment.payment_type === "subscription") {
    await unlockSubscription(payment.session_id);
  } else {
    await unlockSingleSession(payment.session_id);
  }
  return payment;
}

export async function completePaymentByOrderId(orderId: string) {
  const { rows } = await query<{ session_id: string; payment_type: "single" | "subscription" }>(
    `UPDATE payments SET status = 'succeeded', updated_at = NOW()
     WHERE order_id = $1 AND status = 'pending'
     RETURNING session_id, payment_type`,
    [orderId]
  );
  const payment = rows[0];
  if (!payment) return null;
  if (payment.payment_type === "subscription") {
    await unlockSubscription(payment.session_id);
  } else {
    await unlockSingleSession(payment.session_id);
  }
  return payment;
}

export async function completeYoomoneyPayment(data: {
  operationId: string;
  sessionId: string;
  plan: "single" | "subscription";
  amount: number;
}): Promise<{
  influencer_id: string | null;
  amount: string;
  blogger_split_percent: number | null;
} | null> {
  const { rows } = await query<{
    id: string;
    payment_type: "single" | "subscription";
    influencer_id: string | null;
    amount: string;
    blogger_split_percent: number | null;
  }>(
    `UPDATE payments
     SET status = 'succeeded',
         yoomoney_operation_id = $2,
         updated_at = NOW()
     WHERE session_id = $1
       AND status = 'pending'
       AND (yoomoney_operation_id IS NULL OR yoomoney_operation_id = $2)
     RETURNING id, payment_type, influencer_id, amount::text, blogger_split_percent`,
    [data.sessionId, data.operationId]
  );

  const payment = rows[0];
  if (!payment) {
    return null;
  }

  if (payment.payment_type === "subscription") {
    await unlockSubscription(data.sessionId);
  } else {
    await unlockSingleSession(data.sessionId);
  }

  await query(
    `UPDATE history SET is_paid = TRUE WHERE user_id IN (
       SELECT user_id FROM sessions WHERE id = $1 AND user_id IS NOT NULL
     )`,
    [data.sessionId]
  );

  return {
    influencer_id: payment.influencer_id,
    amount: payment.amount,
    blogger_split_percent: payment.blogger_split_percent,
  };
}

/** Mark other active consultations for this master as completed (or remove empty stubs). */
export async function completeOtherActiveSessions(
  userId: string,
  characterKey: string,
  exceptSessionId?: string
): Promise<void> {
  const { rows } = await query<{
    id: string;
    msg_count: string;
    cards: unknown;
    prediction: string | null;
  }>(
    `SELECT s.id,
            (SELECT COUNT(*)::text FROM chat_messages cm WHERE cm.session_id = s.id) AS msg_count,
            s.cards,
            sm.prediction
     FROM sessions s
     LEFT JOIN session_memories sm ON sm.session_id = s.id
     WHERE s.user_id = $1
       AND s.character_key = $2
       AND COALESCE(s.status, 'active') = 'active'
       AND ($3::uuid IS NULL OR s.id <> $3)`,
    [userId, characterKey, exceptSessionId ?? null]
  );

  for (const row of rows) {
    const msgCount = Number.parseInt(row.msg_count, 10);
    const hasSpread = (parseSessionCards(row.cards)?.length ?? 0) >= 3;
    const hasMemory =
      typeof row.prediction === "string" &&
      row.prediction.trim().length > 0 &&
      row.prediction.trim() !== "Сеанс в процессе";

    if (msgCount === 0 && !hasSpread && !hasMemory) {
      await deleteConsultationSession(row.id, userId);
    } else {
      await completeConsultationSession(row.id, userId);
    }
  }
}

/** Remove empty cabinet stubs (no chat, no intention, placeholder prediction). */
export async function pruneEmptySessionStubs(userId: string): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT s.id
     FROM sessions s
     LEFT JOIN session_memories sm ON sm.session_id = s.id
     WHERE s.user_id = $1
       AND s.character_key IS NOT NULL
       AND (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = s.id) = 0
       AND COALESCE(sm.prediction, 'Сеанс в процессе') = 'Сеанс в процессе'
       AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''`,
    [userId]
  );

  let removed = 0;
  for (const row of rows) {
    if (await deleteConsultationSession(row.id, userId)) removed += 1;
  }
  return removed;
}

/** Remove empty duplicate consultation rows (same master + cards); keep the latest only. */
export async function pruneDuplicateActiveSessions(userId: string): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT s.id
     FROM sessions s
     WHERE s.user_id = $1
       AND s.character_key IS NOT NULL
       AND TRIM(s.character_key) <> ''
       AND (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = s.id) = 0
       AND EXISTS (
         SELECT 1 FROM sessions s2
         WHERE s2.user_id = s.user_id
           AND s2.character_key = s.character_key
           AND s2.cards IS NOT DISTINCT FROM s.cards
           AND (
             s2.updated_at > s.updated_at
             OR (s2.updated_at = s.updated_at AND s2.created_at > s.created_at)
           )
       )`,
    [userId]
  );

  let removed = 0;
  for (const row of rows) {
    if (await deleteConsultationSession(row.id, userId)) removed += 1;
  }
  return removed;
}

export async function completeConsultationSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE sessions
     SET status = 'completed', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND COALESCE(status, 'active') = 'active'`,
    [sessionId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export type SessionMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
  image_url?: string | null;
};

export async function getActiveSessionMessages(
  userId: string,
  characterId: string,
  sessionId: string,
  limit = 50
): Promise<SessionMessageRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const { rows } = await query<{
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: Date;
    image_url: string | null;
  }>(
    `SELECT cm.id, cm.role, cm.content, cm.image_url, cm.created_at
     FROM chat_messages cm
     INNER JOIN sessions s ON s.id = cm.session_id
     WHERE cm.session_id = $1
       AND cm.character_id = $2
       AND s.user_id = $3
       AND (cm.owner_user_id IS NULL OR cm.owner_user_id = $3)
     ORDER BY cm.created_at ASC
     LIMIT $4`,
    [sessionId, characterId, userId, safeLimit]
  );
  return rows;
}

/** @deprecated Prefer getActiveSessionMessages — scoped by character_id. */
export async function getOwnedSessionMessages(
  userId: string,
  sessionId: string,
  limit = 50
): Promise<SessionMessageRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const { rows } = await query<{
    id: string;
    role: "user" | "assistant";
    content: string;
    created_at: Date;
    image_url: string | null;
  }>(
    `SELECT cm.id, cm.role, cm.content, cm.image_url, cm.created_at
     FROM chat_messages cm
     INNER JOIN sessions s ON s.id = cm.session_id
     WHERE cm.session_id = $1
       AND s.user_id = $2
       AND (cm.owner_user_id IS NULL OR cm.owner_user_id = $2)
     ORDER BY cm.created_at ASC
     LIMIT $3`,
    [sessionId, userId, safeLimit]
  );
  return rows;
}

export type ConsultationListItem = {
  id: string;
  intention: string | null;
  spread_type: string | null;
  spread_id: string | null;
  cards: string[] | null;
  status: string;
  created_at: Date;
  updated_at: Date;
  message_count: number;
  topic_summary: string | null;
  key_cards: string[] | null;
  prediction: string | null;
};

export async function listConsultationSessions(
  userId: string,
  characterKey: string
): Promise<{ active: ConsultationListItem | null; completed: ConsultationListItem[] }> {
  const sessionSelect = `
    SELECT s.id, s.intention, s.spread_type, s.spread_id, s.cards,
           COALESCE(s.status, 'active') AS status,
           s.created_at, s.updated_at,
           COALESCE(mc.message_count, 0)::int AS message_count,
           sm.topic_summary, sm.key_cards, sm.prediction
     FROM sessions s
     LEFT JOIN session_memories sm ON sm.session_id = s.id
     LEFT JOIN (
       SELECT session_id, COUNT(*)::int AS message_count
       FROM chat_messages
       GROUP BY session_id
     ) mc ON mc.session_id = s.id
     WHERE s.user_id = $1
       AND s.character_key = $2`;

  const { rows: activeRows } = await query<ConsultationListItem & { cards?: unknown }>(
    `${sessionSelect}
       AND COALESCE(s.status, 'active') = 'active'
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [userId, characterKey]
  );

  const activeId = activeRows[0]?.id ?? null;

  const { rows: completedRows } = await query<ConsultationListItem & { cards?: unknown }>(
    `${sessionSelect}
       AND COALESCE(s.status, 'active') = 'completed'
       AND ($3::uuid IS NULL OR s.id <> $3)
     ORDER BY s.updated_at DESC
     LIMIT 10`,
    [userId, characterKey, activeId]
  );

  const mapRow = (r: ConsultationListItem & { cards?: unknown }): ConsultationListItem => ({
    ...r,
    cards: parseSessionCards(r.cards),
    message_count: Number(r.message_count ?? 0),
  });

  return {
    active: activeRows[0] ? mapRow(activeRows[0]) : null,
    completed: completedRows.map(mapRow),
  };
}

/** Remove consultation session, chat, memory and cabinet history entry. */
export async function deleteConsultationSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || session.user_id !== userId) return false;

  await query(`DELETE FROM session_memories WHERE session_id = $1`, [sessionId]);
  await query(`DELETE FROM chat_messages WHERE session_id = $1`, [sessionId]);

  await deleteUserTripletForSession(userId, session);

  await query(
    `DELETE FROM history
     WHERE user_id = $1
       AND context_data->>'sessionId' = $2`,
    [userId, sessionId]
  );

  const paymentBlock = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM payments WHERE session_id = $1 AND status = 'succeeded'
     ) AS exists`,
    [sessionId]
  );
  if (paymentBlock.rows[0]?.exists) {
    await query(
      `UPDATE sessions
       SET status = 'completed',
           character_key = NULL,
           intention = NULL,
           spread_type = NULL,
           cards = NULL,
           awaiting_context = FALSE,
           updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    return true;
  }

  const result = await query(
    `DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
