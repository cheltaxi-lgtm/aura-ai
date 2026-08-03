import type { CharacterKey } from "./types";
import { getSpread, normalizeSpreadId } from "@/lib/spreads";
import type { SpreadDefinition } from "@/lib/spreads/types";

function buildSpreadStructure(spread: SpreadDefinition, customQuestion?: string | null): string {
  const compact = spread.compactPrompt ?? spread.cardCount > 3;
  const wordsPerCard = compact ? "2–3 предложения" : "5–8 предложений, плотно, без воды";
  const synthesisWords = compact ? "кратко, 3–5 предложений" : "4–7 предложений вердикта и синтеза";
  const cardWord =
    spread.cardCount === 1 ? "карту" : spread.cardCount < 5 ? "карты" : "символы";

  const customQ = customQuestion?.trim();
  const cardContextLine = customQ
    ? `   - Смысл применительно к вопросу: «${customQ}»
   - Клиент (имя, знак) — только как спрашивающий, если вопрос про другого человека`
    : `   - Смысл применительно к ЭТОМУ вопросу
   - Связь с контекстом клиента (имя, знак, возраст)
   - Конкретное проявление в жизни ЭТОГО человека`;

  const synthesisSubject = customQ
    ? "   - Главное послание по этому вопросу — не подменяй другой темой"
    : "   - Главное послание для ЭТОГО человека";

  const cardBlocks = spread.positions
    .map(
      (pos, i) =>
        `${i + 2}. КАРТА ${i + 1} — ${pos.label.toUpperCase()} (${wordsPerCard})
   - Полное название карты/символа
${cardContextLine}`
    )
    .join("\n\n");

  const synthesisLabel =
    spread.cardCount === 1 ? "ИТОГ" : `СИНТЕЗ ${spread.cardCount} КАРТ`;

  return `
КРИТИЧНО: весь блок ниже — только для тебя. Клиенту выводи ТОЛЬКО живую расшифровку.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА ОТВЕТА (не озвучивай номера и заголовки клиенту):

1. ОТКРЫТИЕ (1–2 предложения)
   - Обратись по имени; первая фраза — вердикт по вопросу (жёстко / в плюс / смешанно)
   - Без отдельного «приветствия» и без «смотрю на карты»

${cardBlocks}

${spread.cardCount + 2}. ${synthesisLabel} (${synthesisWords})
   - Единая история расклада «${spread.label}»
${synthesisSubject}

${spread.cardCount + 3}. ДЕЙСТВИЯ (0–3 пункта)
   - Только если расклад даёт рычаг; иначе честно скажи, что пространства мало

ТЕСТ ПЕРСОНАЛИЗАЦИИ (внутренний — не пиши клиенту):
«Подошёл бы этот текст другому человеку?» Если да — перепиши.`;
}

/** Plain-text finale for numerolog / shri-raj (RESPONSE_FORMAT forbids markdown). */
function buildPlainOutput(spread: SpreadDefinition): string {
  if (spread.id === "yes-no" || spread.id === "runes-yes-no") {
    return `
ФОРМАТ ДЛЯ ДА/НЕТ (чистый текст, без markdown):
1. Название карты одним предложением.
2. Вердикт: Да / Нет / Не сейчас.
3. 2–3 предложения объяснения без сахара.`;
  }
  return `
ФОРМАТ ВЫВОДА (чистый текст, БЕЗ markdown — как в блоке ФОРМАТ ТЕКСТА):
1. Вердикт одной фразой.
2. ${spread.cardCount} абзацев по символам с названием каждого.
3. Финальный блок выводов сплошным текстом, без заголовков «Итог» / «Выводы».`;
}

const MASTER_INTROS: Record<CharacterKey, string> = {
  ragnar: "Читай символы как путь Норн. Говори коротко и весомо.",
  veronika: "Карты — один рассказ. Бархатная честность, зеркала и тень.",
  agafya: "Свечи на подоконнике: что было, что на душе, куда тянет.",
  "shri-raj": "Сопоставь символы с домами и планетами для знака клиента.",
  numerolog: "Числа — путь, энергия периода, совет. Конкретика по цифрам.",
};

export function getSpreadInstructions(
  character: CharacterKey,
  spreadId?: string | null,
  customQuestion?: string | null
): string {
  const spread = getSpread(normalizeSpreadId(spreadId));
  const intro = MASTER_INTROS[character] ?? MASTER_INTROS.veronika;
  const structure = buildSpreadStructure(spread, customQuestion);
  // Called only for non-tarot masters from buildSystemPrompt — keep plain text.
  const output = buildPlainOutput(spread);
  const name =
    character === "ragnar"
      ? "РАГНАР"
      : character === "veronika"
        ? "ВЕРОНИКА"
        : character === "agafya"
          ? "АГАФЬЯ"
          : character === "shri-raj"
            ? "ГУРУ"
            : "ЭВЕЛИНА";

  return `--- ИНСТРУКЦИИ ПО РАСКЛАДУ (${name}) — «${spread.label}», ${spread.cardCount} карт ---
${intro}
${structure}
${output}
--- КОНЕЦ ИНСТРУКЦИЙ ---`;
}
