import { query, withTransaction } from "./db";
import { getProfileUserIdForAccount } from "./accounts";
import { createNotification } from "./ritual-service";
import { SUPPORT_SYSTEM_SENDER_ID } from "./support-constants";

export type SupportCategory = "general" | "payment" | "technical" | "account" | "other";
export type SupportStatus = "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type SupportPriority = "low" | "normal" | "high";

export interface SupportTicketRow {
  id: string;
  user_account_id: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  priority: SupportPriority;
  assigned_admin_id: string | null;
  unread_by_user: boolean;
  unread_by_admin: boolean;
  last_message_at: Date;
  last_message_by: "user" | "admin" | null;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  sender_type: "user" | "admin";
  sender_id: string;
  content: string;
  created_at: Date;
}

export interface SupportTicketWithMeta extends SupportTicketRow {
  user_email?: string;
  user_name?: string;
  assigned_admin_name?: string | null;
  messages_count?: string;
  last_message_preview?: string | null;
}

const MAX_SUBJECT_LEN = 200;
const MAX_MESSAGE_LEN = 4000;

export { SUPPORT_SYSTEM_SENDER_ID, isSupportSystemSender } from "./support-constants";

function buildSupportAutoReplyText(subject: string): string {
  return [
    "Здравствуйте!",
    "",
    "Ваше обращение принято и передано в службу поддержки.",
    `Тема: «${subject}».`,
    "",
    "Мы ответим в ближайшее рабочее время. Если есть дополнительные детали — напишите их здесь, это поможет быстрее разобраться.",
    "",
    "Спасибо, что обратились!",
  ].join("\n");
}

export function sanitizeSupportText(text: string, maxLen: number): string {
  return text.replace(/\0/g, "").trim().slice(0, maxLen);
}

export function isValidSupportCategory(v: string): v is SupportCategory {
  return ["general", "payment", "technical", "account", "other"].includes(v);
}

export function isValidSupportStatus(v: string): v is SupportStatus {
  return ["open", "in_progress", "waiting_user", "resolved", "closed"].includes(v);
}

export function isValidSupportPriority(v: string): v is SupportPriority {
  return ["low", "normal", "high"].includes(v);
}

export async function createSupportTicket(params: {
  userAccountId: string;
  subject: string;
  category: SupportCategory;
  message: string;
}): Promise<{
  ticket: SupportTicketRow;
  message: SupportMessageRow;
  autoReply: SupportMessageRow;
}> {
  const subject = sanitizeSupportText(params.subject, MAX_SUBJECT_LEN);
  const content = sanitizeSupportText(params.message, MAX_MESSAGE_LEN);

  if (!subject) throw new Error("subject_required");
  if (!content) throw new Error("message_required");

  return withTransaction(async (client) => {
    const ticketRes = await client.query<SupportTicketRow>(
      `INSERT INTO support_tickets
         (user_account_id, subject, category, status, unread_by_admin, last_message_by)
       VALUES ($1, $2, $3, 'open', TRUE, 'user')
       RETURNING *`,
      [params.userAccountId, subject, params.category]
    );
    const ticket = ticketRes.rows[0];

    const msgRes = await client.query<SupportMessageRow>(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_id, content)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [ticket.id, params.userAccountId, content]
    );

    const autoReplyRes = await client.query<SupportMessageRow>(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_id, content)
       VALUES ($1, 'admin', $2, $3)
       RETURNING *`,
      [ticket.id, SUPPORT_SYSTEM_SENDER_ID, buildSupportAutoReplyText(subject)]
    );

    await client.query(
      `UPDATE support_tickets
       SET last_message_at = NOW(),
           last_message_by = 'admin',
           unread_by_user = TRUE,
           unread_by_admin = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [ticket.id]
    );

    return {
      ticket: { ...ticket, unread_by_user: true, last_message_by: "admin" as const },
      message: msgRes.rows[0],
      autoReply: autoReplyRes.rows[0],
    };
  });
}

export async function listUserSupportTickets(userAccountId: string): Promise<SupportTicketWithMeta[]> {
  const { rows } = await query<SupportTicketWithMeta>(
    `SELECT t.*,
            (SELECT content FROM support_messages m
             WHERE m.ticket_id = t.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
            (SELECT COUNT(*)::text FROM support_messages m WHERE m.ticket_id = t.id) AS messages_count
     FROM support_tickets t
     WHERE t.user_account_id = $1
     ORDER BY t.last_message_at DESC`,
    [userAccountId]
  );
  return rows;
}

export async function getUserSupportTicket(
  userAccountId: string,
  ticketId: string
): Promise<SupportTicketRow | null> {
  const { rows } = await query<SupportTicketRow>(
    `SELECT * FROM support_tickets WHERE id = $1 AND user_account_id = $2`,
    [ticketId, userAccountId]
  );
  return rows[0] ?? null;
}

export async function getSupportTicketMessages(ticketId: string): Promise<SupportMessageRow[]> {
  const { rows } = await query<SupportMessageRow>(
    `SELECT * FROM support_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [ticketId]
  );
  return rows;
}

export async function addUserSupportMessage(params: {
  userAccountId: string;
  ticketId: string;
  content: string;
}): Promise<SupportMessageRow | null> {
  const content = sanitizeSupportText(params.content, MAX_MESSAGE_LEN);
  if (!content) throw new Error("message_required");

  const ticket = await getUserSupportTicket(params.userAccountId, params.ticketId);
  if (!ticket) return null;
  if (ticket.status === "closed" || ticket.status === "resolved") {
    throw new Error("ticket_closed");
  }

  return withTransaction(async (client) => {
    const msgRes = await client.query<SupportMessageRow>(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_id, content)
       VALUES ($1, 'user', $2, $3)
       RETURNING *`,
      [params.ticketId, params.userAccountId, content]
    );

    await client.query(
      `UPDATE support_tickets
       SET last_message_at = NOW(),
           last_message_by = 'user',
           unread_by_admin = TRUE,
           unread_by_user = FALSE,
           status = CASE WHEN status = 'waiting_user' THEN 'in_progress' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [params.ticketId]
    );

    return msgRes.rows[0];
  });
}

export async function markTicketReadByUser(userAccountId: string, ticketId: string): Promise<void> {
  await query(
    `UPDATE support_tickets
     SET unread_by_user = FALSE, updated_at = NOW()
     WHERE id = $1 AND user_account_id = $2`,
    [ticketId, userAccountId]
  );
}

export async function closeTicketByUser(userAccountId: string, ticketId: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE support_tickets
     SET status = 'closed', closed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_account_id = $2 AND status NOT IN ('closed', 'resolved')`,
    [ticketId, userAccountId]
  );
  return (rowCount ?? 0) > 0;
}

export async function countUnreadSupportTicketsForUser(userAccountId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM support_tickets
     WHERE user_account_id = $1 AND unread_by_user = TRUE`,
    [userAccountId]
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}

// --- Admin ---

export async function listAdminSupportTickets(params: {
  status?: SupportStatus | "all";
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<SupportTicketWithMeta[]> {
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.status && params.status !== "all") {
    conditions.push(`t.status = $${idx++}`);
    values.push(params.status);
  }
  if (params.unreadOnly) {
    conditions.push(`t.unread_by_admin = TRUE`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  values.push(limit, offset);

  const { rows } = await query<SupportTicketWithMeta>(
    `SELECT t.*,
            ua.email AS user_email,
            ua.name AS user_name,
            aa.name AS assigned_admin_name,
            (SELECT content FROM support_messages m
             WHERE m.ticket_id = t.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview,
            (SELECT COUNT(*)::text FROM support_messages m WHERE m.ticket_id = t.id) AS messages_count
     FROM support_tickets t
     JOIN user_accounts ua ON ua.id = t.user_account_id
     LEFT JOIN admin_accounts aa ON aa.id = t.assigned_admin_id
     ${where}
     ORDER BY t.unread_by_admin DESC, t.last_message_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    values
  );
  return rows;
}

export async function getAdminSupportTicket(ticketId: string): Promise<SupportTicketWithMeta | null> {
  const { rows } = await query<SupportTicketWithMeta>(
    `SELECT t.*,
            ua.email AS user_email,
            ua.name AS user_name,
            ua.profile_user_id,
            aa.name AS assigned_admin_name,
            (SELECT COUNT(*)::text FROM support_messages m WHERE m.ticket_id = t.id) AS messages_count
     FROM support_tickets t
     JOIN user_accounts ua ON ua.id = t.user_account_id
     LEFT JOIN admin_accounts aa ON aa.id = t.assigned_admin_id
     WHERE t.id = $1`,
    [ticketId]
  );
  return rows[0] ?? null;
}

export async function addAdminSupportMessage(params: {
  adminId: string;
  ticketId: string;
  content: string;
}): Promise<SupportMessageRow | null> {
  const content = sanitizeSupportText(params.content, MAX_MESSAGE_LEN);
  if (!content) throw new Error("message_required");

  const ticket = await getAdminSupportTicket(params.ticketId);
  if (!ticket) return null;
  if (ticket.status === "closed") throw new Error("ticket_closed");

  const message = await withTransaction(async (client) => {
    const msgRes = await client.query<SupportMessageRow>(
      `INSERT INTO support_messages (ticket_id, sender_type, sender_id, content)
       VALUES ($1, 'admin', $2, $3)
       RETURNING *`,
      [params.ticketId, params.adminId, content]
    );

    await client.query(
      `UPDATE support_tickets
       SET last_message_at = NOW(),
           last_message_by = 'admin',
           unread_by_user = TRUE,
           unread_by_admin = FALSE,
           assigned_admin_id = COALESCE(assigned_admin_id, $2),
           status = CASE
             WHEN status = 'open' THEN 'waiting_user'
             WHEN status = 'in_progress' THEN 'waiting_user'
             ELSE status
           END,
           updated_at = NOW()
       WHERE id = $1`,
      [params.ticketId, params.adminId]
    );

    return msgRes.rows[0];
  });

  const profileUserId = (ticket as SupportTicketWithMeta & { profile_user_id?: string }).profile_user_id
    ?? await getProfileUserIdForAccount(ticket.user_account_id);

  if (profileUserId) {
    await createNotification({
      userId: profileUserId,
      type: "support_reply",
      title: "Ответ поддержки",
      body: `По обращению «${ticket.subject.slice(0, 60)}»`,
      data: {
        ticketId: ticket.id,
        ctaPath: "/cabinet/support",
        ctaLabel: "Открыть чат",
      },
      idempotencyKey: `support_reply:${ticket.id}:${message.id}`,
    });
  }

  return message;
}

export async function updateAdminSupportTicket(params: {
  adminId: string;
  ticketId: string;
  status?: SupportStatus;
  priority?: SupportPriority;
  assignedAdminId?: string | null;
}): Promise<SupportTicketRow | null> {
  const ticket = await getAdminSupportTicket(params.ticketId);
  if (!ticket) return null;

  const sets: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];
  let idx = 1;

  if (params.status && isValidSupportStatus(params.status)) {
    sets.push(`status = $${idx++}`);
    values.push(params.status);
    if (params.status === "closed" || params.status === "resolved") {
      sets.push(`closed_at = NOW()`);
    } else {
      sets.push(`closed_at = NULL`);
    }
  }
  if (params.priority && isValidSupportPriority(params.priority)) {
    sets.push(`priority = $${idx++}`);
    values.push(params.priority);
  }
  if (params.assignedAdminId !== undefined) {
    sets.push(`assigned_admin_id = $${idx++}`);
    values.push(params.assignedAdminId);
  }

  if (sets.length === 1) return ticket;

  values.push(params.ticketId);

  const { rows } = await query<SupportTicketRow>(
    `UPDATE support_tickets SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function markTicketReadByAdmin(ticketId: string): Promise<void> {
  await query(
    `UPDATE support_tickets SET unread_by_admin = FALSE, updated_at = NOW() WHERE id = $1`,
    [ticketId]
  );
}

export async function getSupportAdminStats(): Promise<{
  open: number;
  unread: number;
  total: number;
}> {
  const { rows } = await query<{ open: string; unread: string; total: string }>(`
    SELECT
      (SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('closed', 'resolved'))::text AS open,
      (SELECT COUNT(*) FROM support_tickets WHERE unread_by_admin = TRUE AND status NOT IN ('closed', 'resolved'))::text AS unread,
      (SELECT COUNT(*) FROM support_tickets)::text AS total
  `);
  const r = rows[0];
  return {
    open: parseInt(r?.open ?? "0", 10),
    unread: parseInt(r?.unread ?? "0", 10),
    total: parseInt(r?.total ?? "0", 10),
  };
}

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  general: "Общий вопрос",
  payment: "Оплата и руны",
  technical: "Техническая проблема",
  account: "Аккаунт",
  other: "Другое",
};

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Открыто",
  in_progress: "В работе",
  waiting_user: "Ожидает ответа",
  resolved: "Решено",
  closed: "Закрыто",
};

export const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
};
