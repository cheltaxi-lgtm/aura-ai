import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";
import { ensureDb, query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { findStoredSpreadReading } from "@/lib/session-spread-reading";
import { SHARE_BODY_MAX, sanitizeShareBody } from "./sanitize";
import type { SharePayload } from "./types";

const SESSION_SUMMARY_PREFIX = /^Итог сеанса:/i;

async function fetchHistoryReadingById(
  userId: string,
  historyId: string
): Promise<string | null> {
  const { rows } = await query<{ context_data: Record<string, unknown> }>(
    `SELECT context_data
     FROM history
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [historyId, userId]
  );
  const reading = rows[0]?.context_data?.reading;
  if (typeof reading !== "string") return null;
  const trimmed = reading.trim();
  return trimmed.length >= MIN_SPREAD_READING_CHARS ? trimmed : null;
}

async function fetchPrimarySpreadMessage(
  sessionId: string,
  userId: string,
  characterKey?: string
): Promise<string | null> {
  const { rows } = characterKey
    ? await query<{ content: string }>(
        `SELECT content
         FROM chat_messages
         WHERE session_id = $1
           AND role = 'assistant'
           AND character_id = $3
           AND (owner_user_id IS NULL OR owner_user_id = $2)
         ORDER BY created_at ASC`,
        [sessionId, userId, characterKey]
      )
    : await query<{ content: string }>(
        `SELECT content
         FROM chat_messages
         WHERE session_id = $1
           AND role = 'assistant'
           AND (owner_user_id IS NULL OR owner_user_id = $2)
         ORDER BY created_at ASC`,
        [sessionId, userId]
      );

  for (const row of rows) {
    const content = row.content.trim();
    if (content.length < MIN_SPREAD_READING_CHARS) continue;
    if (SESSION_SUMMARY_PREFIX.test(content) && content.length < 240) continue;
    return content;
  }

  return null;
}

async function fetchHistoryReadingText(
  userId: string,
  sessionId: string,
  characterKey?: string
): Promise<string | null> {
  if (!characterKey) return null;

  const session = await getSession(sessionId);
  if (!session || session.user_id !== userId) return null;

  const reading = await findStoredSpreadReading(userId, characterKey, session);
  if (!reading || reading.length < MIN_SPREAD_READING_CHARS) return null;
  return reading;
}

/** Resolve full original reading text from server sources (not follow-up chat). */
export async function resolveShareReadingText(
  payload: SharePayload,
  userId?: string | null
): Promise<string | null> {
  if (!userId || !(await ensureDb())) return null;

  const characterKey = payload.masterKey;

  if (payload.historyId) {
    const fromHistory = await fetchHistoryReadingById(userId, payload.historyId);
    if (fromHistory) return fromHistory;
  }

  if (payload.sessionId) {
    const session = await getSession(payload.sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }

    const resolvedKey = characterKey ?? session.character_key ?? undefined;

    const fromStored = await fetchHistoryReadingText(userId, payload.sessionId, resolvedKey);
    if (fromStored) return fromStored;

    const fromChat = await fetchPrimarySpreadMessage(payload.sessionId, userId, resolvedKey);
    if (fromChat) return fromChat;
  }

  return null;
}

/** Prefer full server-side original reading over truncated client excerpt. */
export async function enrichShareExcerpt(
  payload: SharePayload,
  userId?: string | null
): Promise<{ payload: SharePayload; excerptTruncated: boolean }> {
  const clientExcerpt = payload.excerpt?.trim() ?? "";
  const serverText = await resolveShareReadingText(payload, userId);

  if (!serverText || serverText.length <= clientExcerpt.length) {
    return { payload, excerptTruncated: false };
  }

  const cleaned = sanitizeShareBody(serverText.slice(0, SHARE_BODY_MAX));
  const excerptTruncated = cleaned.endsWith("…");

  return {
    payload: { ...payload, excerpt: cleaned },
    excerptTruncated,
  };
}
