import { proQuery } from "../db";
import {
  AvitoApiError,
  getChatMessages,
  getChats,
  getSelf,
  markChatRead,
  sendTextMessage,
  type AvitoMessageItem,
} from "@/lib/avito/client";

export interface AvitoChatRow {
  id: string;
  avito_user_id: string | null;
  client_avito_user_id: string | null;
  client_name: string | null;
  item_id: string | null;
  item_title: string | null;
  last_message_at: Date | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  unread_by_practitioner: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AvitoMessageRow {
  id: string;
  chat_id: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  author_id: string | null;
  avito_created_at: Date | null;
  created_at: Date;
}

const MAX_MESSAGE_LEN = 4000;
const MAX_PREVIEW_LEN = 200;

/** Message object as delivered by the messenger webhook (payload.value, v3). */
export interface AvitoWebhookMessageValue {
  id?: string;
  chat_id?: string;
  user_id?: number;
  author_id?: number;
  created?: number;
  type?: string;
  item_id?: number;
  content?: { text?: string };
}

function sanitizeAvitoText(text: string, maxLen: number): string {
  return text.replace(/\0/g, "").trim().slice(0, maxLen);
}

function toUnixDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000)
    : null;
}

async function upsertAvitoChat(params: {
  id: string;
  avitoUserId?: number | null;
  clientAvitoUserId?: number | null;
  clientName?: string | null;
  itemId?: number | null;
  itemTitle?: string | null;
}): Promise<void> {
  await proQuery(
    `INSERT INTO pro.avito_chats (id, avito_user_id, client_avito_user_id, client_name, item_id, item_title)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       avito_user_id        = COALESCE(EXCLUDED.avito_user_id, pro.avito_chats.avito_user_id),
       client_avito_user_id = COALESCE(EXCLUDED.client_avito_user_id, pro.avito_chats.client_avito_user_id),
       client_name          = COALESCE(EXCLUDED.client_name, pro.avito_chats.client_name),
       item_id              = COALESCE(EXCLUDED.item_id, pro.avito_chats.item_id),
       item_title           = COALESCE(EXCLUDED.item_title, pro.avito_chats.item_title),
       updated_at           = NOW()`,
    [
      params.id,
      params.avitoUserId ?? null,
      params.clientAvitoUserId ?? null,
      params.clientName ?? null,
      params.itemId ?? null,
      params.itemTitle ?? null,
    ]
  );
}

/** Returns the inserted row, or null when the message id was already stored. */
async function insertAvitoMessage(params: {
  id: string;
  chatId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  authorId?: number | null;
  avitoCreatedAt: Date | null;
  raw?: unknown;
}): Promise<AvitoMessageRow | null> {
  const { rows } = await proQuery<AvitoMessageRow>(
    `INSERT INTO pro.avito_messages
       (id, chat_id, direction, type, text, author_id, avito_created_at, raw)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, chat_id, direction, type, text, author_id, avito_created_at, created_at`,
    [
      params.id,
      params.chatId,
      params.direction,
      params.type || "text",
      params.text,
      params.authorId ?? null,
      params.avitoCreatedAt,
      params.raw ? JSON.stringify(params.raw) : null,
    ]
  );
  return rows[0] ?? null;
}

async function touchAvitoChatAfterMessage(params: {
  chatId: string;
  direction: "in" | "out";
  text: string | null;
  at: Date | null;
}): Promise<void> {
  const preview = params.text ? params.text.slice(0, MAX_PREVIEW_LEN) : null;
  await proQuery(
    `UPDATE pro.avito_chats
     SET last_message_at        = COALESCE($2, last_message_at, NOW()),
         last_message_preview   = COALESCE($3, last_message_preview),
         last_message_direction = $4,
         unread_by_practitioner = unread_by_practitioner OR $5,
         updated_at             = NOW()
     WHERE id = $1`,
    [params.chatId, params.at, preview, params.direction, params.direction === "in"]
  );
}

export async function ingestAvitoWebhookMessage(
  value: AvitoWebhookMessageValue
): Promise<void> {
  const chatId = typeof value.chat_id === "string" ? value.chat_id : "";
  const messageId = typeof value.id === "string" ? value.id : "";
  if (!chatId || !messageId) return;

  const direction: "in" | "out" =
    value.author_id != null && value.author_id === value.user_id ? "out" : "in";
  const text = typeof value.content?.text === "string" ? value.content.text : null;
  const at = toUnixDate(value.created);

  await upsertAvitoChat({
    id: chatId,
    avitoUserId: value.user_id ?? null,
    itemId: value.item_id ?? null,
  });
  const inserted = await insertAvitoMessage({
    id: messageId,
    chatId,
    direction,
    type: value.type ?? "text",
    text,
    authorId: value.author_id ?? null,
    avitoCreatedAt: at,
    raw: value,
  });
  if (inserted) {
    await touchAvitoChatAfterMessage({ chatId, direction, text, at });
  }
}

export async function listProAvitoChats(params: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<AvitoChatRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const { rows } = await proQuery<AvitoChatRow>(
    `SELECT * FROM pro.avito_chats
     WHERE ($1::boolean = FALSE OR unread_by_practitioner = TRUE)
     ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
     LIMIT $2 OFFSET $3`,
    [params.unreadOnly === true, limit, offset]
  );
  return rows;
}

export async function getAvitoProStats(): Promise<{ total: number; unread: number }> {
  const { rows } = await proQuery<{ total: string; unread: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE unread_by_practitioner)::text AS unread
     FROM pro.avito_chats`
  );
  return {
    total: Number(rows[0]?.total ?? 0),
    unread: Number(rows[0]?.unread ?? 0),
  };
}

export async function getProAvitoChat(chatId: string): Promise<AvitoChatRow | null> {
  const { rows } = await proQuery<AvitoChatRow>(
    `SELECT * FROM pro.avito_chats WHERE id = $1`,
    [chatId]
  );
  return rows[0] ?? null;
}

export async function getAvitoChatMessages(
  chatId: string,
  limit = 200
): Promise<AvitoMessageRow[]> {
  const { rows } = await proQuery<AvitoMessageRow>(
    `SELECT id, chat_id, direction, type, text, author_id, avito_created_at, created_at
     FROM (
       SELECT * FROM pro.avito_messages WHERE chat_id = $1
       ORDER BY avito_created_at DESC NULLS LAST, created_at DESC
       LIMIT $2
     ) recent
     ORDER BY avito_created_at ASC NULLS LAST, created_at ASC`,
    [chatId, Math.min(Math.max(limit, 1), 500)]
  );
  return rows;
}

export async function markAvitoChatReadByPractitioner(chatId: string): Promise<void> {
  await proQuery(
    `UPDATE pro.avito_chats SET unread_by_practitioner = FALSE, updated_at = NOW() WHERE id = $1`,
    [chatId]
  );
  const chat = await getProAvitoChat(chatId);
  const accountId = chat?.avito_user_id ? Number(chat.avito_user_id) : null;
  if (!accountId) return;
  // Best-effort: a failed read receipt must not break the Pro UI.
  await markChatRead(accountId, chatId).catch(() => {});
}

export async function sendProAvitoMessage(params: {
  chatId: string;
  content: string;
}): Promise<AvitoMessageRow> {
  const text = sanitizeAvitoText(params.content, MAX_MESSAGE_LEN);
  if (!text) throw new Error("message_required");

  const chat = await getProAvitoChat(params.chatId);
  if (!chat) throw new Error("chat_not_found");

  const self = await getSelf();
  const sent = await sendTextMessage(self.id, params.chatId, text);
  const at = toUnixDate(sent.created) ?? new Date();

  const inserted = await insertAvitoMessage({
    id: sent.id,
    chatId: params.chatId,
    direction: "out",
    type: sent.type ?? "text",
    text,
    authorId: self.id,
    avitoCreatedAt: at,
    raw: sent,
  });
  await touchAvitoChatAfterMessage({
    chatId: params.chatId,
    direction: "out",
    text,
    at,
  });
  if (inserted) return inserted;

  const { rows } = await proQuery<AvitoMessageRow>(
    `SELECT id, chat_id, direction, type, text, author_id, avito_created_at, created_at
     FROM pro.avito_messages WHERE id = $1`,
    [sent.id]
  );
  return rows[0];
}

/**
 * Backfill chats and recent messages from the Avito API. Compensates for
 * webhook downtime and fills client names / item titles the webhook payload
 * does not carry.
 */
export async function syncAvitoChatsFromApi(): Promise<{ chats: number; messages: number }> {
  const self = await getSelf();
  const limit = 50;
  let chatsCount = 0;
  let messagesCount = 0;

  // Hard cap of 20 pages (1000 chats) so a runaway loop is impossible.
  for (let page = 0; page < 20; page++) {
    const data = await getChats(self.id, { limit, offset: page * limit });
    const chats = data.chats ?? [];
    if (chats.length === 0) break;

    for (const chat of chats) {
      chatsCount++;
      const clientUser = (chat.users ?? []).find((u) => u.user_id !== self.id);
      const item = chat.context?.type === "item" ? chat.context.value : undefined;
      await upsertAvitoChat({
        id: chat.id,
        avitoUserId: self.id,
        clientAvitoUserId: clientUser?.user_id ?? null,
        clientName: clientUser?.name ?? null,
        itemId: item?.id ?? null,
        itemTitle: item?.title ?? null,
      });

      let messages: AvitoMessageItem[] = [];
      try {
        const res = await getChatMessages(self.id, chat.id, { limit: 50 });
        messages = res.messages ?? [];
      } catch (err) {
        // 402 = no paid messenger subscription: chat list still syncs.
        if (!(err instanceof AvitoApiError && err.status === 402)) throw err;
      }
      for (const message of messages) {
        if (!message.id) continue;
        const direction: "in" | "out" = message.direction === "out" ? "out" : "in";
        const text = typeof message.content?.text === "string" ? message.content.text : null;
        const inserted = await insertAvitoMessage({
          id: message.id,
          chatId: chat.id,
          direction,
          type: message.type ?? "text",
          text,
          authorId: message.author_id ?? null,
          avitoCreatedAt: toUnixDate(message.created),
          raw: message,
        });
        if (inserted) {
          messagesCount++;
          await touchAvitoChatAfterMessage({
            chatId: chat.id,
            direction,
            text,
            at: toUnixDate(message.created),
          });
        }
      }
    }

    if (chats.length < limit) break;
  }

  return { chats: chatsCount, messages: messagesCount };
}
