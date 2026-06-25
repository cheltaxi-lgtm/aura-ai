import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";
import { ensureDb, query } from "@/lib/db";
import { saveMessage, updateSessionChatMeta } from "@/lib/session";
import { ensureChatSession } from "@/lib/session-access";
import { upsertSessionMemoryFromChat } from "@/lib/session-memory";
import { topicLabel, isValidSessionIntention, type SessionTopicId } from "@/lib/session-topics";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import { getDeckImagePath } from "@/data/decks";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { isTarotRuneMasterId } from "@/lib/prompts/tarot-rune-format";
import { stripTheaterFromReply } from "@/lib/chat-reply-sanitize";

/** Markdown image block for the first assistant message (tarot/runes/slavic only). */
export function buildSpreadCardImagesMarkdown(
  characterId: string,
  cards: { name: string }[]
): string {
  if (!isTarotRuneMasterId(characterId) || isNumerologMaster(characterId)) return "";
  if (cards.length < 3) return "";

  const system = resolveMasterDeckSystem(characterId);
  const lines = cards
    .slice(0, 3)
    .map((c) => c.name.trim())
    .filter(Boolean)
    .map((name) => {
      const path = getDeckImagePath(system, name);
      return `![${name}](${path})`;
    });

  return lines.length >= 3 ? lines.join("\n") : "";
}

/** Prepend card images + markdown header for ChatMessageRenderer. */
export function formatSpreadReadingWithCards(
  reading: string,
  cards: { name: string }[],
  characterId?: string
): string {
  const body = reading.trim();
  if (!body || cards.length < 3) return body;

  const names = cards.slice(0, 3).map((c) => c.name.trim()).filter(Boolean);
  if (names.length < 3) return body;

  const cardLine = names.map((n) => `**${n}**`).join(" · ");
  const hasHeader = body.includes("##") && names.every((n) => body.includes(n));
  const header = hasHeader ? "" : `## Ваш расклад\n\n${cardLine}`;

  const images =
    characterId && isTarotRuneMasterId(characterId)
      ? buildSpreadCardImagesMarkdown(characterId, cards)
      : "";

  const textBlock = [header, body].filter(Boolean).join("\n\n");
  return [images, textBlock].filter(Boolean).join("\n\n");
}
export type PersistSpreadReadingInput = {
  profileUserId: string;
  characterId: string;
  reading: string;
  sessionId?: string;
  tarotCards?: { name: string }[];
  intention?: string;
  spreadType?: "daily" | "new" | null;
};

/** True when session already has a substantive assistant spread message. */
export async function sessionHasSpreadReadingMessage(
  sessionId: string,
  characterId: string,
  profileUserId: string,
  minChars = MIN_SPREAD_READING_CHARS
): Promise<boolean> {
  const { rows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM chat_messages
     WHERE session_id = $1
       AND character_id = $2
       AND role = 'assistant'
       AND (owner_user_id IS NULL OR owner_user_id = $3)
       AND LENGTH(TRIM(content)) >= $4`,
    [sessionId, characterId, profileUserId, minChars]
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

/**
 * Idempotently persist the opening spread reading as the first assistant chat message.
 * Returns the session id used (created or resolved).
 */
export async function ensureSpreadReadingInChatMessages(
  input: PersistSpreadReadingInput
): Promise<string | null> {
  const readingRaw = input.reading.trim();
  if (readingRaw.length < MIN_SPREAD_READING_CHARS) return input.sessionId ?? null;
  if (!(await ensureDb())) return input.sessionId ?? null;

  const ensured = await ensureChatSession(input.sessionId, input.profileUserId);
  const sessionId = ensured.session?.id;
  if (!sessionId) return null;

  const cardNames = input.tarotCards?.map((c) => c.name).slice(0, 3) ?? [];
  const reading =
    isNumerologMaster(input.characterId) || !isTarotRuneMasterId(input.characterId)
      ? readingRaw
      : stripTheaterFromReply(readingRaw);
  const formattedReading = formatSpreadReadingWithCards(
    reading,
    input.tarotCards ?? [],
    input.characterId
  );

  await updateSessionChatMeta(sessionId, {
    characterKey: input.characterId,
    cards: cardNames.length ? cardNames : null,
    ...(input.intention ? { intention: input.intention } : {}),
    ...(input.spreadType ? { spreadType: input.spreadType } : {}),
  });

  const alreadySaved = await sessionHasSpreadReadingMessage(
    sessionId,
    input.characterId,
    input.profileUserId
  );
  if (!alreadySaved) {
    await saveMessage(
      sessionId,
      input.characterId,
      "assistant",
      formattedReading,
      input.profileUserId
    );
  }

  const topicSummary =
    input.intention && isValidSessionIntention(input.intention)
      ? topicLabel(input.intention as SessionTopicId)
      : isNumerologMaster(input.characterId)
        ? "Нумерология"
        : input.spreadType === "daily"
          ? "Три карты дня"
          : "Сеанс";

  await upsertSessionMemoryFromChat({
    userId: input.profileUserId,
    sessionId,
    characterKey: input.characterId,
    topicSummary,
    keyCards: cardNames,
    prediction: formattedReading,
  });

  return sessionId;
}
