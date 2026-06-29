import type { SessionMemory } from "./types";
import { isTextRelevantToQuery } from "@/lib/memory/memory-relevance";

/** Format in-memory session summaries (legacy prompt path — DB memory uses user-memory.ts). */
export function formatLegacySessionMemories(
  memories: SessionMemory[],
  characterName: string,
  queryText?: string
): string {
  if (!memories.length) return "";

  const query = queryText?.trim() ?? "";
  const filtered = query
    ? memories.filter((m) =>
        isTextRelevantToQuery(
          query,
          `${m.topicSummary} ${m.prediction} ${m.keyCards.join(" ")}`
        )
      )
    : [];

  if (!filtered.length) return "";

  const memorySummary = filtered
    .map(
      (m, i) => `
Сеанс ${i + 1} (${m.date}):
- Тема: ${m.topicSummary}
- Карты/символы: ${m.keyCards.join(", ")}
- Что было предсказано: ${m.prediction}
${m.mood ? `- Настроение клиента: ${m.mood}` : ""}
${m.outcomeRating ? `- Точность по мнению человека: ${m.outcomeRating}/5` : ""}`
    )
    .join("\n");

  return `
=== ПАМЯТЬ О ПРЕДЫДУЩИХ СЕАНСАХ С ${characterName.toUpperCase()} ===
${memorySummary}

ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ ПАМЯТИ:
- Блок уже отобран под текущий вопрос — если тема совпадает, вплетай детали органично.
- Если клиент спрашивает о другом — не подмешивай чужие темы из памяти.
- Не пересказывай всю историю — одна уместная деталь лучше, чем перечисление.
=== КОНЕЦ ПАМЯТИ ===`;
}

export const SESSION_SUMMARY_PROMPT = `Ты помощник мастера эзотерической платформы Zovus. Сделай краткое саммари прошедшего сеанса в формате JSON:
{
  "topicSummary": "о чём спрашивал человек (1 предложение)",
  "keyCards": ["главный символ 1", "главный символ 2"],
  "prediction": "что было предсказано (1-2 предложения)",
  "mood": "эмоциональное состояние: тревога/надежда/горе/злость/любопытство"
}
Только JSON, без лишнего текста.`;
