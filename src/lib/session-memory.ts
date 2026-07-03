import { query } from "@/lib/db";
import { MARKDOWN_IMAGE_PATTERN } from "@/lib/reading-text-polish";
import { SHARE_BODY_MAX } from "@/lib/share/sanitize";
import { completeChat } from "@/lib/llm";
import { limitSpreadKeyCards } from "@/lib/spreads";
import { SESSION_SUMMARY_PROMPT } from "@/lib/prompts/memory";
import { isTextRelevantToQuery } from "@/lib/memory/memory-relevance";
import {
  recordLifetimeOrphanMemory,
  recordLifetimeSessionActivity,
} from "@/lib/user-lifetime-stats";
import type { SessionMemory } from "@/lib/prompts/types";

/**
 * Predictions are shown as plain-text previews (session lists, cabinet, shares)
 * and fed into LLM memory context — raw `![Card](/decks/...)` image markdown is
 * noise in both, so strip it before the text ever reaches the database.
 */
function cleanPredictionText(text: string): string {
  return text
    .replace(MARKDOWN_IMAGE_PATTERN, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SessionMemoryRow {
  date: string;
  topic_summary: string;
  key_cards: string[];
  prediction: string;
  outcome_rating: number | null;
  mood: string | null;
}

export async function getSessionMemories(
  userId: string,
  characterKey: string,
  limit = 3,
  excludeSessionId?: string | null
): Promise<SessionMemory[]> {
  const { rows } = await query<SessionMemoryRow>(
    `SELECT
       TO_CHAR(session_date, 'DD.MM.YYYY') AS date,
       topic_summary,
       key_cards,
       prediction,
       outcome_rating,
       mood
     FROM session_memories
     WHERE user_id = $1
       AND character_key = $2
       AND session_id IS NOT NULL
       AND ($4::uuid IS NULL OR session_id <> $4)
     ORDER BY session_date DESC
     LIMIT $3`,
    [userId, characterKey, limit, excludeSessionId ?? null]
  );

  return rows.map((r) => ({
    date: r.date,
    topicSummary: r.topic_summary,
    keyCards: r.key_cards ?? [],
    prediction: r.prediction,
    outcomeRating: r.outcome_rating ?? undefined,
    mood: r.mood ?? undefined,
  }));
}

export async function countSessionMemories(userId: string, characterKey: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM session_memories
     WHERE user_id = $1 AND character_key = $2`,
    [userId, characterKey]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

export async function saveSessionMemory(input: {
  userId: string;
  characterKey: string;
  topicSummary: string;
  keyCards: string[];
  prediction: string;
  mood?: string;
  outcomeRating?: number;
  sessionId?: string;
}): Promise<void> {
  if (input.sessionId) {
    await upsertSessionMemoryFromChat({
      userId: input.userId,
      sessionId: input.sessionId,
      characterKey: input.characterKey,
      topicSummary: input.topicSummary,
      keyCards: input.keyCards,
      prediction: input.prediction,
      mood: input.mood,
    });
    if (input.outcomeRating != null) {
      await query(
        `UPDATE session_memories SET outcome_rating = $3
         WHERE session_id = $2 AND user_id = $1`,
        [input.userId, input.sessionId, input.outcomeRating]
      );
    }
    return;
  }

  await query(
    `INSERT INTO session_memories
       (user_id, character_key, topic_summary, key_cards, prediction, mood, outcome_rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.userId,
      input.characterKey,
      input.topicSummary,
      input.keyCards,
      cleanPredictionText(input.prediction),
      input.mood ?? null,
      input.outcomeRating ?? null,
    ]
  );
  void recordLifetimeOrphanMemory({
    userId: input.userId,
    characterKey: input.characterKey,
    cardCount: input.keyCards.length,
  }).catch((err) => console.warn("[lifetime-stats] orphan memory:", err));
}

/** Create or refresh cabinet row when a consultation session starts or updates. */
export async function ensureSessionMemoryStub(input: {
  userId: string;
  sessionId: string;
  characterKey: string;
  topicSummary: string;
  keyCards: string[];
  prediction?: string;
}): Promise<void> {
  await upsertSessionMemoryFromChat({
    userId: input.userId,
    sessionId: input.sessionId,
    characterKey: input.characterKey,
    topicSummary: input.topicSummary,
    keyCards: input.keyCards,
    prediction: input.prediction?.trim() || "Сеанс в процессе",
  });
}

/** Upsert cabinet session row after each master reply — any character, any session length. */
export async function upsertSessionMemoryFromChat(input: {
  userId: string;
  sessionId: string;
  characterKey: string;
  topicSummary: string;
  keyCards: string[];
  prediction: string;
  mood?: string;
}): Promise<void> {
  await query(
    `INSERT INTO session_memories
       (user_id, session_id, character_key, topic_summary, key_cards, prediction, mood)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO UPDATE SET
       character_key = EXCLUDED.character_key,
       topic_summary = EXCLUDED.topic_summary,
       key_cards = EXCLUDED.key_cards,
       prediction = EXCLUDED.prediction,
       mood = COALESCE(EXCLUDED.mood, session_memories.mood),
       session_date = NOW()`,
    [
      input.userId,
      input.sessionId,
      input.characterKey,
      input.topicSummary.slice(0, 500),
      limitSpreadKeyCards(input.keyCards),
      cleanPredictionText(input.prediction).slice(0, SHARE_BODY_MAX),
      input.mood ?? null,
    ]
  );

  void recordLifetimeSessionActivity({
    userId: input.userId,
    sessionId: input.sessionId,
    characterKey: input.characterKey,
    cardCount: limitSpreadKeyCards(input.keyCards).length,
  }).catch((err) => console.warn("[lifetime-stats] session activity:", err));
}

function parseSessionSummary(
  text: string,
  cardNames: string[]
): Omit<SessionMemory, "date" | "outcomeRating"> | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as {
      topicSummary?: string;
      keyCards?: string[];
      prediction?: string;
      mood?: string;
    };
    if (!parsed.topicSummary || !parsed.prediction) return null;
    return {
      topicSummary: parsed.topicSummary,
      keyCards: limitSpreadKeyCards(
        parsed.keyCards?.length ? parsed.keyCards : cardNames
      ),
      prediction: parsed.prediction,
      mood: parsed.mood,
    };
  } catch {
    return null;
  }
}

export async function generateSessionSummary(
  transcript: string,
  cardNames: string[]
): Promise<Omit<SessionMemory, "date" | "outcomeRating"> | null> {
  const text = await completeChat({
    messages: [
      { role: "system", content: SESSION_SUMMARY_PROMPT },
      {
        role: "user",
        content: `Карты расклада: ${cardNames.join(", ") || "не указаны"}\n\nПереписка:\n${transcript.slice(0, 6000)}`,
      },
    ],
    maxTokens: 400,
    temperature: 0.3,
  });

  return text ? parseSessionSummary(text, cardNames) : null;
}

/** Enrich existing session row with LLM summary after longer dialogue. */
export async function maybePersistSessionMemory(params: {
  userId: string;
  sessionId?: string;
  characterKey: string;
  messages: { role: string; content: string }[];
  cardNames: string[];
  lastAssistantReply: string;
}): Promise<void> {
  const userTurns = params.messages.filter((m) => m.role === "user").length;
  if (userTurns < 3 || userTurns % 3 !== 0) return;

  const transcript = params.messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Клиент" : "Мастер"}: ${m.content}`)
    .concat([`Мастер: ${params.lastAssistantReply}`])
    .join("\n");

  const summary = await generateSessionSummary(transcript, params.cardNames);
  if (!summary) return;

  const lastUserMsg =
    [...params.messages].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
  if (
    lastUserMsg &&
    !isTextRelevantToQuery(lastUserMsg, `${summary.topicSummary} ${summary.prediction}`)
  ) {
    return;
  }

  if (params.sessionId) {
    // Upsert so the episodic row is created mid-chat even when no prior row
    // exists (pure chat sessions), not just updated when one happens to exist.
    await upsertSessionMemoryFromChat({
      userId: params.userId,
      sessionId: params.sessionId,
      characterKey: params.characterKey,
      topicSummary: summary.topicSummary,
      keyCards: summary.keyCards,
      prediction: summary.prediction,
      mood: summary.mood,
    });
    return;
  }

  const { rows } = await query<{ recent: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM session_memories
       WHERE user_id = $1 AND character_key = $2
         AND created_at > NOW() - INTERVAL '1 hour'
     ) AS recent`,
    [params.userId, params.characterKey]
  );
  if (rows[0]?.recent) return;

  await saveSessionMemory({
    userId: params.userId,
    characterKey: params.characterKey,
    topicSummary: summary.topicSummary,
    keyCards: summary.keyCards,
    prediction: summary.prediction,
    mood: summary.mood,
  });
}

