import { getUserById } from "@/lib/users";
import { query, ensureDb } from "@/lib/db";
import { lifeFocusLabel, type LifeFocus } from "@/lib/astro-profile";
import { tarotCardsKey } from "@/lib/tarot";

const MAX_BLOCK_CHARS = 4000;

export interface UserMemoryOptions {
  currentCharacterId?: string;
  excludeHistoryId?: string;
  currentCardsKey?: string;
  excludeSessionId?: string | null;
}

export type ClientProfile = {
  name?: string | null;
  gender?: string | null;
  zodiac?: string | null;
  birthDate?: string | null;
  mainQuestion?: string | null;
  lifeFocus?: string | null;
};

/** Level 1: immutable client profile for prompts. */
export function buildClientBlock(profile: ClientProfile | null | undefined): string {
  if (!profile) return "";
  const lines: string[] = [];
  if (profile.name) lines.push(`Имя: ${profile.name}.`);
  if (profile.gender) lines.push(`Пол: ${profile.gender}.`);
  if (profile.zodiac) lines.push(`Знак: ${profile.zodiac}.`);
  if (profile.birthDate) lines.push(`Дата рождения: ${profile.birthDate}.`);
  if (profile.mainQuestion) lines.push(`Главный вопрос: «${profile.mainQuestion}».`);
  if (profile.lifeFocus) {
    lines.push(
      `Тема жизни: ${lifeFocusLabel(profile.lifeFocus as LifeFocus) ?? profile.lifeFocus}.`
    );
  }
  if (!lines.length) return "";
  return `\nПРОФИЛЬ КЛИЕНТА:\n${lines.join("\n")}\n`;
}

/** Level 2: past session summaries only — no raw chat excerpts. */
export async function buildMemoryBlock(
  userId: string,
  characterKey: string,
  currentSessionId: string
): Promise<string> {
  if (!(await ensureDb())) return "";

  const { rows } = await query<{
    topic_summary: string;
    key_cards: string[] | null;
    prediction: string;
    mood: string | null;
    session_date: Date;
  }>(
    `SELECT topic_summary, key_cards, prediction, mood, session_date
     FROM session_memories
     WHERE user_id = $1
       AND character_key = $2
       AND session_id IS NOT NULL
       AND session_id <> $3
     ORDER BY session_date DESC
     LIMIT 3`,
    [userId, characterKey, currentSessionId]
  );

  if (!rows.length) return "";

  const list = rows
    .map((m) => {
      const date = new Date(m.session_date).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
      });
      const cards = m.key_cards?.join(" · ") ?? "";
      return `— ${date}: ${m.topic_summary}. Карты: ${cards}.`;
    })
    .join("\n");

  const block = `
ПАМЯТЬ О ПРОШЛЫХ СЕАНСАХ С ЭТИМ ЧЕЛОВЕКОМ:
${list}

Используй это как фон — не пересказывай.
Текущий сеанс — отдельный разговор.
`;

  return block.length > MAX_BLOCK_CHARS ? `${block.slice(0, MAX_BLOCK_CHARS - 1)}…` : block;
}

export function appendUserMemoryToPrompt(systemPrompt: string, memoryBlock: string | null): string {
  if (!memoryBlock?.trim()) return systemPrompt;
  return `${systemPrompt}\n\n--- служебный контекст (не включать в ответ) ---\n${memoryBlock}\n--- конец служебного контекста ---`;
}

export async function getUserMemoryPreview(profileUserId: string): Promise<{
  readingCount: number;
  chatTurnCount: number;
  factsCount: number;
  hasMainQuestion: boolean;
}> {
  if (!(await ensureDb())) {
    return { readingCount: 0, chatTurnCount: 0, factsCount: 0, hasMainQuestion: false };
  }

  const [memoryCount, factsCount, user] = await Promise.all([
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM session_memories
       WHERE user_id = $1 AND session_id IS NOT NULL`,
      [profileUserId]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM user_facts WHERE user_id = $1`,
      [profileUserId]
    ),
    getUserById(profileUserId),
  ]);

  return {
    readingCount: Number.parseInt(memoryCount.rows[0]?.count ?? "0", 10),
    chatTurnCount: 0,
    factsCount: Number.parseInt(factsCount.rows[0]?.count ?? "0", 10),
    hasMainQuestion: Boolean(user?.main_question),
  };
}

export function cardsKeyFromTarot(cards: { name: string }[] | undefined): string | undefined {
  const key = tarotCardsKey(cards);
  return key || undefined;
}
