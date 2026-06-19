import { query } from "@/lib/db";
import { completeChat } from "@/lib/llm";
import { SESSION_SUMMARY_PROMPT } from "@/lib/prompts/memory";
import type { SessionMemory } from "@/lib/prompts/types";

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
  limit = 3
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
     WHERE user_id = $1 AND character_key = $2
     ORDER BY session_date DESC
     LIMIT $3`,
    [userId, characterKey, limit]
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
}): Promise<void> {
  await query(
    `INSERT INTO session_memories
       (user_id, character_key, topic_summary, key_cards, prediction, mood, outcome_rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.userId,
      input.characterKey,
      input.topicSummary,
      input.keyCards,
      input.prediction,
      input.mood ?? null,
      input.outcomeRating ?? null,
    ]
  );
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
    isPaid: false,
  });

  if (!text) return null;

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
      keyCards: parsed.keyCards?.length ? parsed.keyCards : cardNames.slice(0, 3),
      prediction: parsed.prediction,
      mood: parsed.mood,
    };
  } catch {
    return null;
  }
}

/** Save summary after ≥3 user turns; skip if saved in last hour for same character. */
export async function maybePersistSessionMemory(params: {
  userId: string;
  characterKey: string;
  messages: { role: string; content: string }[];
  cardNames: string[];
  lastAssistantReply: string;
}): Promise<void> {
  const userTurns = params.messages.filter((m) => m.role === "user").length;
  if (userTurns < 3 || userTurns % 3 !== 0) return;

  const { rows } = await query<{ recent: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM session_memories
       WHERE user_id = $1 AND character_key = $2
         AND created_at > NOW() - INTERVAL '1 hour'
     ) AS recent`,
    [params.userId, params.characterKey]
  );
  if (rows[0]?.recent) return;

  const transcript = params.messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "Клиент" : "Мастер"}: ${m.content}`)
    .concat([`Мастер: ${params.lastAssistantReply}`])
    .join("\n");

  const summary = await generateSessionSummary(transcript, params.cardNames);
  if (!summary) return;

  await saveSessionMemory({
    userId: params.userId,
    characterKey: params.characterKey,
    topicSummary: summary.topicSummary,
    keyCards: summary.keyCards,
    prediction: summary.prediction,
    mood: summary.mood,
  });
}
