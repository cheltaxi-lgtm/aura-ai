import { query, queryClient, type PoolClient } from "./db";
import { getRuneSettings } from "./rune-settings";

export interface SessionRow {
  id: string;
  user_id: string | null;
  referrer_slug: string | null;
  free_questions_used: number;
  paid_until: Date | null;
  has_single_unlock: boolean;
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
  const { rows } = await query<SessionRow>(
    "SELECT id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock FROM sessions WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
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
     RETURNING id, user_id, referrer_slug, free_questions_used, paid_until, has_single_unlock`,
    [referrerSlug ?? null, safeUserId, influencerToken ?? null]
  );
  return rows[0];
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
}

export async function saveMessage(
  sessionId: string,
  characterId: string,
  role: "user" | "assistant",
  content: string
) {
  await query(
    "INSERT INTO chat_messages (session_id, character_id, role, content) VALUES ($1, $2, $3, $4)",
    [sessionId, characterId, role, content]
  );
}

export async function getMessages(sessionId: string, characterId: string) {
  const { rows } = await query<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages
     WHERE session_id = $1 AND character_id = $2 ORDER BY created_at ASC`,
    [sessionId, characterId]
  );
  return rows;
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
  await query(
    `INSERT INTO payments (session_id, order_id, yukassa_payment_id, yoomoney_operation_id, amount, payment_type, status, referrer_slug, blogger_split_percent, influencer_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
     ON CONFLICT (order_id) DO NOTHING`,
    [
      data.sessionId,
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
     WHERE order_id = $1 RETURNING session_id, payment_type`,
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
}) {
  await query(
    `UPDATE payments SET status = 'succeeded', yoomoney_operation_id = $2, updated_at = NOW()
     WHERE session_id = $1 AND status = 'pending'`,
    [data.sessionId, data.operationId]
  );

  if (data.plan === "subscription") {
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
}
