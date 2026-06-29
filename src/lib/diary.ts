import { query } from "@/lib/db";
import { completeChat } from "@/lib/llm";
import { limitSpreadKeyCards } from "@/lib/spreads";

export interface DiaryEntry {
  id: string;
  character_key: string;
  entry_text: string;
  cards: string[];
  created_at: Date;
}

export async function listDiaryEntries(userId: string, limit = 20): Promise<DiaryEntry[]> {
  const { rows } = await query<DiaryEntry>(
    `SELECT id, character_key, entry_text, cards, created_at
     FROM diary_entries
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

export async function deleteDiaryEntry(userId: string, entryId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM diary_entries WHERE id = $1 AND user_id = $2`,
    [entryId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function saveDiaryEntry(
  userId: string,
  characterKey: string,
  entryText: string,
  cards: string[] = []
): Promise<void> {
  await query(
    `INSERT INTO diary_entries (user_id, character_key, entry_text, cards)
     VALUES ($1, $2, $3, $4)`,
    [userId, characterKey, entryText.slice(0, 2000), limitSpreadKeyCards(cards)]
  );
}

export async function generateDiaryEntry(
  history: { role: string; content: string }[]
): Promise<string | null> {
  const transcript = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Клиент" : "Мастер"}: ${m.content}`)
    .join("\n");

  return completeChat({
    messages: [
      {
        role: "system",
        content:
          "Ты помощник эзотерической платформы Zovus. Пиши только текст записи, без пояснений.",
      },
      {
        role: "user",
        content: `Напиши запись в личный дневник судьбы от лица клиента.
3-4 предложения. Что показали символы сегодня. Что важно помнить.
Тон: личный, тихий, как письмо самому себе на ночь.
Без имён мастеров. Только суть и ощущение.
История сеанса:
${transcript}`,
      },
    ],
    maxTokens: 300,
    temperature: 0.7,
  });
}

export async function maybeCreateDiaryEntry(
  userId: string,
  characterKey: string,
  userMessageCount: number,
  history: { role: string; content: string }[],
  cards: string[] = []
): Promise<void> {
  if (userMessageCount < 3 || userMessageCount % 3 !== 0) return;

  const text = await generateDiaryEntry(history);
  if (!text?.trim()) return;

  await saveDiaryEntry(userId, characterKey, text.trim(), cards);
}
