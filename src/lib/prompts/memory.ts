import type { SessionMemory } from "./types";

export function buildMemoryBlock(
  memories: SessionMemory[],
  characterName: string
): string {
  if (!memories.length) return "";

  const memorySummary = memories
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
- Если прошло предсказание — упомяни это как подтверждение своей силы
- Если тема повторяется — укажи на это как на паттерн
- Обращайся к конкретным деталям из прошлых сеансов
- Не пересказывай всю историю — вплети детали органично
- Если человек спрашивает то же что и раньше — скажи об этом прямо
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
