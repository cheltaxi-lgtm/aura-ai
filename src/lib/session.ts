import { query, queryClient, withTransaction, type PoolClient } from "./db";
import { LLM_CONTEXT_MESSAGES } from "./chat-limits";
import { getRuneSettings } from "./rune-settings";
import { getSetting } from "./settings";
import { creditRunesToUser } from "./rune-service";
import { deleteUserTripletForSession } from "./triplet-cleanup";
import {
  profileHasGuestIntroLifetimeFlag,
  recordGuestIntroUsed,
} from "./rate-limit-anchors";
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
  memory_read_mode?: "default" | "fresh";
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
  COALESCE(memory_read_mode, 'default') AS memory_read_mode,
  COALESCE(status, 'active') AS status, created_at, updated_at
`;

function parseNumerologToolParams(raw: unknown): NumerologToolParams | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const partnerName = typeof o.partnerName === "string" ? o.partnerName.trim() : "";
  const partnerDate = typeof o.partnerDate === "string" ? o.partnerDate.trim() : "";
  const objectValue = typeof o.objectValue === "string" ? o.objectValue.trim() : "";
  const matrixSubjectId =
    typeof o.matrixSubjectId === "string" ? o.matrixSubjectId.trim() : "";
  const matrixBirthDate =
    typeof o.matrixBirthDate === "string" ? o.matrixBirthDate.trim() : "";
  const subjectName = typeof o.subjectName === "string" ? o.subjectName.trim() : "";
  if (
    !partnerName &&
    !partnerDate &&
    !objectValue &&
    !matrixSubjectId &&
    !matrixBirthDate &&
    !subjectName
  ) {
    return null;
  }
  return {
    ...(partnerName ? { partnerName } : {}),
    ...(partnerDate ? { partnerDate } : {}),
    ...(objectValue ? { objectValue } : {}),
    ...(matrixSubjectId ? { matrixSubjectId } : {}),
    ...(matrixBirthDate ? { matrixBirthDate } : {}),
    ...(subjectName ? { subjectName } : {}),
  };
}

function parseSessionCards(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const names = raw
      .map((c) => {
        if (typeof c === "string" && c.trim()) return c.trim();
        if (c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") {
          const name = String((c as { name: string }).name).trim();
          const reversed = Boolean((c as { reversed?: unknown }).reversed);
          return name ? (reversed ? `${name} (перевёрнутая)` : name) : "";
        }
        return "";
      })
      .filter((n) => n.length > 0);
    return names.length ? names : null;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.kind === "guest_triplet_resume" && Array.isArray(obj.symbols)) {
      return parseSessionCards(obj.symbols);
    }
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

/** Owner-scoped switch for suppressing all long-term memory reads in one session. */
export async function setSessionMemoryReadMode(
  sessionId: string,
  userId: string,
  mode: "default" | "fresh"
): Promise<boolean> {
  const result = await query(
    `UPDATE sessions
        SET memory_read_mode = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
        AND COALESCE(status, 'active') = 'active'`,
    [sessionId, userId, mode]
  );
  return (result.rowCount ?? 0) > 0;
}

/** Fail closed: only the owner and default mode may read long-term memory. */
export async function canSessionReadLongTermMemory(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { rows } = await query<{ allowed: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM sessions
        WHERE id = $1 AND user_id = $2
          AND COALESCE(memory_read_mode, 'default') = 'default'
     ) AS allowed`,
    [sessionId, userId]
  );
  return rows[0]?.allowed === true;
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
    // Preserve structured guest-resume receipt payload if present.
    let preserveGuestPayload = false;
    if (meta.cards?.length) {
      try {
        const { rows } = await query<{ cards: unknown; spread_type: string | null }>(
          `SELECT cards, spread_type FROM sessions WHERE id = $1 LIMIT 1`,
          [sessionId]
        );
        const existing = rows[0];
        const existingCards = existing?.cards;
        const isGuestPayload =
          existingCards &&
          typeof existingCards === "object" &&
          !Array.isArray(existingCards) &&
          (existingCards as { kind?: unknown }).kind === "guest_triplet_resume";
        const isGuestSpread =
          existing?.spread_type === "guest_resume" || meta.spreadType === "guest_resume";
        preserveGuestPayload = Boolean(isGuestPayload || isGuestSpread);
      } catch {
        preserveGuestPayload = false;
      }
    }
    if (!preserveGuestPayload) {
      sets.push(`cards = $${idx++}::jsonb`);
      params.push(meta.cards?.length ? JSON.stringify(meta.cards) : null);
    }
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

/**
 * Owner-scoped session meta write.
 * Defense-in-depth: WHERE includes user_id so a foreign sessionId cannot mutate.
 */
export async function updateSessionChatMetaForUser(
  sessionId: string,
  userId: string,
  meta: {
    characterKey?: string;
    intention?: string | null;
    spreadType?: string | null;
    spreadId?: string | null;
    cards?: string[] | null;
    numerologToolParams?: NumerologToolParams | null;
  },
  client?: PoolClient
): Promise<boolean> {
  const run = <T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => (client ? queryClient<T>(client, text, params) : query<T>(text, params));

  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [sessionId, userId];
  let idx = 3;

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
    let preserveGuestPayload = false;
    if (meta.cards?.length) {
      try {
        const { rows } = await run<{ cards: unknown; spread_type: string | null }>(
          `SELECT cards, spread_type FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
          [sessionId, userId]
        );
        const existing = rows[0];
        const existingCards = existing?.cards;
        const isGuestPayload =
          existingCards &&
          typeof existingCards === "object" &&
          !Array.isArray(existingCards) &&
          (existingCards as { kind?: unknown }).kind === "guest_triplet_resume";
        const isGuestSpread =
          existing?.spread_type === "guest_resume" || meta.spreadType === "guest_resume";
        preserveGuestPayload = Boolean(isGuestPayload || isGuestSpread);
      } catch {
        preserveGuestPayload = false;
      }
    }
    if (!preserveGuestPayload) {
      sets.push(`cards = $${idx++}::jsonb`);
      params.push(meta.cards?.length ? JSON.stringify(meta.cards) : null);
    }
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

  if (sets.length === 1) {
    const { rows } = await run<{ id: string }>(
      `SELECT id FROM sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [sessionId, userId]
    );
    return Boolean(rows[0]);
  }

  const { rows } = await run<{ id: string }>(
    `UPDATE sessions
     SET ${sets.join(", ")}
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    params
  );
  return Boolean(rows[0]);
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

export async function unlockSubscription(
  sessionId: string,
  days = 30,
  bonusPaymentId?: string
) {
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
          `Подписка ${days} дней — эквивалент рун`,
          bonusPaymentId
        );
      }
    }
  }
}

export function isPgForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23503"
  );
}

/**
 * The sessions row can disappear under an in-flight chat (nightly cleanup of
 * >48h empty stubs racing a resumed old tab). Resurrect a minimal stub so the
 * active conversation is not lost; ON CONFLICT keeps an existing row intact.
 */
export async function resurrectSessionStub(
  sessionId: string,
  userId: string | null,
  characterKey: string | null
): Promise<void> {
  await query(
    `INSERT INTO sessions (id, user_id, character_key)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [sessionId, userId, characterKey]
  );
}

export async function saveMessage(
  sessionId: string,
  characterId: string,
  role: "user" | "assistant",
  content: string,
  ownerUserId?: string | null
) {
  const insert = () =>
    query(
      `INSERT INTO chat_messages (session_id, character_id, role, content, owner_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, characterId, role, content, ownerUserId ?? null]
    );
  try {
    await insert();
  } catch (error) {
    if (!isPgForeignKeyViolation(error)) throw error;
    console.warn(
      `[session] saveMessage FK violation — resurrecting session ${sessionId}`
    );
    await resurrectSessionStub(sessionId, ownerUserId ?? null, characterId);
    await insert();
  }
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

export async function completePayment(
  yukassaPaymentId: string,
  verifiedAmountRub: number
) {
  if (!Number.isFinite(verifiedAmountRub)) {
    console.warn("[completePayment] verifiedAmountRub required", yukassaPaymentId);
    return null;
  }

  // Amount must match before flipping status — otherwise retries never unlock.
  const { rows } = await query<{
    session_id: string;
    payment_type: "single" | "subscription";
    influencer_id: string | null;
    amount: string;
    blogger_split_percent: number | null;
  }>(
    `UPDATE payments SET status = 'succeeded', updated_at = NOW()
     WHERE yukassa_payment_id = $1 AND status = 'pending'
       AND ABS(amount - $2::numeric) < 0.01
     RETURNING session_id, payment_type, influencer_id, amount::text, blogger_split_percent`,
    [yukassaPaymentId, verifiedAmountRub]
  );
  const payment = rows[0];
  if (!payment) {
    const pending = await query<{ amount: string }>(
      `SELECT amount::text FROM payments
       WHERE yukassa_payment_id = $1 AND status = 'pending' LIMIT 1`,
      [yukassaPaymentId]
    );
    if (pending.rows[0]) {
      console.warn(
        "[completePayment] amount mismatch",
        yukassaPaymentId,
        "expected",
        pending.rows[0].amount,
        "verified",
        verifiedAmountRub
      );
    }
    return null;
  }

  if (payment.payment_type === "subscription") {
    await unlockSubscription(payment.session_id, 30, `sub-bonus:${yukassaPaymentId}`);
  } else {
    await unlockSingleSession(payment.session_id);
  }
  return payment;
}

/** Prefer completePayment(yukassaId, amount). Order-id path also requires amount binding. */
export async function completePaymentByOrderId(
  orderId: string,
  verifiedAmountRub: number
) {
  if (!Number.isFinite(verifiedAmountRub)) {
    console.warn("[completePaymentByOrderId] verifiedAmountRub required", orderId);
    return null;
  }

  const { rows } = await query<{
    session_id: string;
    payment_type: "single" | "subscription";
    yukassa_payment_id: string | null;
  }>(
    `UPDATE payments SET status = 'succeeded', updated_at = NOW()
     WHERE order_id = $1 AND status = 'pending'
       AND ABS(amount - $2::numeric) < 0.01
     RETURNING session_id, payment_type, yukassa_payment_id`,
    [orderId, verifiedAmountRub]
  );
  const payment = rows[0];
  if (!payment) return null;
  const bonusKey = payment.yukassa_payment_id
    ? `sub-bonus:${payment.yukassa_payment_id}`
    : `sub-bonus:order:${orderId}`;
  if (payment.payment_type === "subscription") {
    await unlockSubscription(payment.session_id, 30, bonusKey);
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
       AND payment_type = $3
       AND ABS(amount - $4::numeric) < 0.01
       AND (yoomoney_operation_id IS NULL OR yoomoney_operation_id = $2)
     RETURNING id, payment_type, influencer_id, amount::text, blogger_split_percent`,
    [data.sessionId, data.operationId, data.plan, data.amount]
  );

  const payment = rows[0];
  if (!payment) {
    console.warn(
      "[completeYoomoneyPayment] rejected",
      data.sessionId,
      data.plan,
      data.amount,
      data.operationId
    );
    return null;
  }

  if (payment.payment_type === "subscription") {
    await unlockSubscription(data.sessionId, 30, `sub-bonus:ym:${data.operationId}`);
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
            COALESCE(s.message_count, 0)::text AS msg_count,
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

  await Promise.all(
    rows.map(async (row) => {
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
    })
  );
}

/** Remove empty cabinet stubs (no chat, no intention, placeholder prediction). */
export async function pruneEmptySessionStubs(userId: string): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT s.id
     FROM sessions s
     LEFT JOIN session_memories sm ON sm.session_id = s.id
     WHERE s.user_id = $1
       AND s.character_key IS NOT NULL
       AND COALESCE(s.message_count, 0) = 0
       AND COALESCE(sm.prediction, 'Сеанс в процессе') = 'Сеанс в процессе'
       AND COALESCE(NULLIF(TRIM(s.intention), ''), '') = ''`,
    [userId]
  );

  const results = await Promise.all(
    rows.map((row) => deleteConsultationSession(row.id, userId))
  );
  return results.filter(Boolean).length;
}

/** Remove empty duplicate consultation rows (same master + cards); keep the latest only. */
export async function pruneDuplicateActiveSessions(userId: string): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT s.id
     FROM sessions s
     WHERE s.user_id = $1
       AND s.character_key IS NOT NULL
       AND TRIM(s.character_key) <> ''
       AND COALESCE(s.message_count, 0) = 0
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

  const results = await Promise.all(
    rows.map((row) => deleteConsultationSession(row.id, userId))
  );
  return results.filter(Boolean).length;
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
  /** Destiny-matrix subject (list preview / title). */
  matrix_subject_id?: string | null;
  matrix_birth_date?: string | null;
  matrix_calculation_version?: string | null;
  matrix_subject_name?: string | null;
  matrix_subject_kind?: string | null;
  matrix_structured_data?: Record<string, unknown> | null;
  /** First assistant reading snippet when session_memories.prediction is a stub. */
  reading_preview?: string | null;
  /** Free-form question from history.context_data.customQuestion. */
  custom_question?: string | null;
};

function formatListBirthDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function listConsultationSessions(
  userId: string,
  characterKey: string
): Promise<{ active: ConsultationListItem | null; completed: ConsultationListItem[] }> {
  const sessionSelect = `
    SELECT s.id, s.intention, s.spread_type, s.spread_id, s.cards,
           COALESCE(s.status, 'active') AS status,
           s.created_at, s.updated_at,
           COALESCE(s.message_count, 0)::int AS message_count,
           sm.topic_summary, sm.key_cards, sm.prediction,
           n.subject_id AS matrix_subject_id,
           n.birth_date AS matrix_birth_date_raw,
           n.calculation_version AS matrix_calculation_version,
           n.structured_data AS matrix_structured_data,
           ms.display_name AS matrix_subject_name,
           ms.kind AS matrix_subject_kind,
           COALESCE(
             NULLIF(TRIM(s.numerolog_tool_params->>'matrixBirthDate'), ''),
             NULL
           ) AS matrix_birth_from_params,
           COALESCE(
             NULLIF(TRIM(s.numerolog_tool_params->>'subjectName'), ''),
             NULL
           ) AS matrix_name_from_params,
           (
             SELECT left(cm.content, 280)
             FROM chat_messages cm
             WHERE cm.session_id = s.id
               AND cm.role = 'assistant'
               AND length(trim(cm.content)) > 40
             ORDER BY cm.created_at ASC
             LIMIT 1
           ) AS reading_preview,
           (
             SELECT NULLIF(TRIM(h.context_data->>'customQuestion'), '')
             FROM history h
             WHERE h.user_id = s.user_id
               AND h.context_data->>'sessionId' = s.id::text
               AND NULLIF(TRIM(h.context_data->>'customQuestion'), '') IS NOT NULL
             ORDER BY h.created_at DESC
             LIMIT 1
           ) AS custom_question
     FROM sessions s
     LEFT JOIN session_memories sm ON sm.session_id = s.id
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
       AND s.character_key = $2`;

  type ListRow = ConsultationListItem & {
    cards?: unknown;
    matrix_birth_date_raw?: Date | string | null;
    matrix_birth_from_params?: string | null;
    matrix_name_from_params?: string | null;
  };

  const { rows: activeRows } = await query<ListRow>(
    `${sessionSelect}
       AND COALESCE(s.status, 'active') = 'active'
     ORDER BY s.updated_at DESC
     LIMIT 1`,
    [userId, characterKey]
  );

  const activeId = activeRows[0]?.id ?? null;

  const { rows: completedRows } = await query<ListRow>(
    `${sessionSelect}
       AND COALESCE(s.status, 'active') = 'completed'
       AND ($3::uuid IS NULL OR s.id <> $3)
     ORDER BY s.updated_at DESC
     LIMIT 10`,
    [userId, characterKey, activeId]
  );

  const mapRow = (r: ListRow): ConsultationListItem => {
    const birth =
      formatListBirthDate(r.matrix_birth_date_raw) ||
      (r.matrix_birth_from_params?.trim() || null);
    const subjectName =
      r.matrix_subject_name?.trim() ||
      r.matrix_name_from_params?.trim() ||
      null;
    return {
      id: r.id,
      intention: r.intention,
      spread_type: r.spread_type,
      spread_id: r.spread_id,
      cards: parseSessionCards(r.cards),
      status: r.status,
      created_at: r.created_at,
      updated_at: r.updated_at,
      message_count: Number(r.message_count ?? 0),
      topic_summary: r.topic_summary,
      key_cards: r.key_cards,
      prediction: r.prediction,
      matrix_subject_id: r.matrix_subject_id ?? null,
      matrix_birth_date: birth,
      matrix_calculation_version: r.matrix_calculation_version ?? null,
      matrix_structured_data: r.matrix_structured_data ?? null,
      matrix_subject_name: subjectName,
      matrix_subject_kind: r.matrix_subject_kind ?? null,
      reading_preview: r.reading_preview ?? null,
      custom_question: r.custom_question?.trim() || null,
    };
  };

  return {
    active: activeRows[0] ? mapRow(activeRows[0]) : null,
    completed: completedRows.map(mapRow),
  };
}

/** Detach or expire joint readings that reference a consultation session. */
async function detachJointReadingsForSession(
  sessionId: string,
  userId: string
): Promise<void> {
  await query(
    `UPDATE joint_readings
     SET status = CASE
           WHEN status IN ('pending_partner', 'partner_done') THEN 'expired'
           ELSE status
         END,
         initiator_session_id = CASE
           WHEN initiator_session_id = $1 THEN NULL
           ELSE initiator_session_id
         END,
         partner_session_id = CASE
           WHEN partner_session_id = $1 THEN NULL
           ELSE partner_session_id
         END
     WHERE (initiator_session_id = $1 AND initiator_user_id = $2)
        OR (partner_session_id = $1 AND partner_user_id = $2)`,
    [sessionId, userId]
  );
}

/** Remove consultation session, chat, memory and cabinet history entry. */
export async function deleteConsultationSession(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session || session.user_id !== userId) return false;

  const paymentBlock = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM payments WHERE session_id = $1 AND status = 'succeeded'
     ) AS exists`,
    [sessionId]
  );
  const hasSucceededPayment = Boolean(paymentBlock.rows[0]?.exists);

  const guestStatusRes = await query<{ guest_resume_status: string | null }>(
    `SELECT guest_resume_status FROM sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  const guestIntroStatus = guestStatusRes.rows[0]?.guest_resume_status;
  const isGuestIntro =
    guestIntroStatus === "claimed" || guestIntroStatus === "reading_consumed";

  if (isGuestIntro) {
    // Fail-closed: durable guestIntroUsedAt must persist BEFORE any destructive wipe.
    try {
      await withTransaction(async (client) => {
        await recordGuestIntroUsed(userId, new Date(), client);
        const marked = await profileHasGuestIntroLifetimeFlag(userId, client);
        if (!marked) {
          throw new Error("guest_intro_marker_not_persisted");
        }

        await queryClient(client, `DELETE FROM session_memories WHERE session_id = $1`, [
          sessionId,
        ]);
        await queryClient(client, `DELETE FROM chat_messages WHERE session_id = $1`, [
          sessionId,
        ]);
        await queryClient(
          client,
          `DELETE FROM history
           WHERE user_id = $1
             AND context_data->>'sessionId' = $2`,
          [userId, sessionId]
        );

        if (hasSucceededPayment) {
          await queryClient(
            client,
            `UPDATE sessions
             SET status = 'completed',
                 character_key = NULL,
                 intention = NULL,
                 spread_type = NULL,
                 spread_id = NULL,
                 cards = NULL,
                 awaiting_context = FALSE,
                 guest_resume_token_hash = NULL,
                 guest_resume_fingerprint = NULL,
                 guest_resume_reading_id = NULL,
                 guest_resume_expires_at = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [sessionId, userId]
          );
          return;
        }

        await queryClient(
          client,
          `DELETE FROM sessions WHERE id = $1 AND user_id = $2`,
          [sessionId, userId]
        );
      });
      // Soft detach after successful wipe (non-critical for entitlement).
      await detachJointReadingsForSession(sessionId, userId);
      return true;
    } catch (err) {
      console.error("deleteConsultationSession guest-intro fail-closed:", err);
      return false;
    }
  }

  await detachJointReadingsForSession(sessionId, userId);

  await query(`DELETE FROM session_memories WHERE session_id = $1`, [sessionId]);
  await query(`DELETE FROM chat_messages WHERE session_id = $1`, [sessionId]);

  await deleteUserTripletForSession(userId, session);

  await query(
    `DELETE FROM history
     WHERE user_id = $1
       AND context_data->>'sessionId' = $2`,
    [userId, sessionId]
  );

  if (hasSucceededPayment) {
    await query(
      `UPDATE sessions
       SET status = 'completed',
           character_key = NULL,
           intention = NULL,
           spread_type = NULL,
           spread_id = NULL,
           cards = NULL,
           awaiting_context = FALSE,
           guest_resume_token_hash = NULL,
           guest_resume_fingerprint = NULL,
           guest_resume_reading_id = NULL,
           guest_resume_expires_at = NULL,
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
