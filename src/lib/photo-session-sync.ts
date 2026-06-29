import { query } from "@/lib/db";
import { ensureChatSession } from "@/lib/session-access";
import { saveMessage, updateSessionChatMeta } from "@/lib/session";
import { limitSpreadKeyCards } from "@/lib/spreads";
import { ensureSessionMemoryStub } from "@/lib/session-memory";
import {
  buildPhotoReadingUserMessage,
  type PhotoHistoryContext,
} from "@/lib/photo-chat";

async function countSessionMessages(sessionId: string): Promise<number> {
  const { rows } = await query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM chat_messages WHERE session_id = $1`,
    [sessionId]
  );
  return rows[0]?.cnt ?? 0;
}

export async function patchHistorySessionId(
  userId: string,
  historyId: string,
  sessionId: string
): Promise<void> {
  await query(
    `UPDATE history SET context_data = jsonb_set(
       COALESCE(context_data, '{}'::jsonb),
       '{sessionId}',
       to_jsonb($3::text),
       true
     )
     WHERE id = $1 AND user_id = $2`,
    [historyId, userId, sessionId]
  );
}

/** Ensure DB session + chat messages exist for a saved photo reading. */
export async function syncPhotoReadingSession(params: {
  profileUserId: string;
  characterId: string;
  contextData: PhotoHistoryContext;
  historyId?: string;
  preferredSessionId?: string;
}): Promise<string | undefined> {
  const analysis = (params.contextData.analysis ?? params.contextData.reading ?? "").trim();
  if (!analysis) return undefined;

  const detectedCards = params.contextData.detectedCards ?? [];
  const question = params.contextData.question ?? "";

  const ensured = await ensureChatSession(
    params.preferredSessionId ?? params.contextData.sessionId,
    params.profileUserId
  );
  const sessionId = ensured.session?.id;
  if (!sessionId) return undefined;

  await updateSessionChatMeta(sessionId, {
    characterKey: params.characterId,
    spreadType: "photo",
    cards: detectedCards.length ? detectedCards : null,
  });

  const messageCount = await countSessionMessages(sessionId);
  if (messageCount === 0) {
    const userMsg = buildPhotoReadingUserMessage(question, detectedCards);
    await saveMessage(sessionId, params.characterId, "user", userMsg, params.profileUserId);
    await saveMessage(sessionId, params.characterId, "assistant", analysis, params.profileUserId);
  }

  const topicSummary = question.trim()
    ? `Фото-расклад: ${question.trim().slice(0, 120)}`
    : "Фото-расклад";
  await ensureSessionMemoryStub({
    userId: params.profileUserId,
    sessionId,
    characterKey: params.characterId,
    topicSummary,
    keyCards: limitSpreadKeyCards(detectedCards),
    prediction: analysis.slice(0, 500),
  });

  if (params.historyId) {
    await patchHistorySessionId(params.profileUserId, params.historyId, sessionId);
  }

  return sessionId;
}
