import type { CharacterKey } from "./types";
import { getSpread, normalizeSpreadId } from "@/lib/spreads";
import type { SpreadDefinition } from "@/lib/spreads/types";

function buildSpreadStructure(spread: SpreadDefinition, customQuestion?: string | null): string {
  const compact = spread.compactPrompt ?? spread.cardCount > 3;
  const wordsPerCard = compact ? "2–3 предложения" : "минимум 120 слов";
  const synthesisWords = compact ? "кратко, 3–5 предложений" : "минимум 100 слов";
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

1. ПРИВЕТСТВИЕ (2-3 предложения)
   - Обратись по имени
   - Назови все ${spread.cardCount} ${cardWord} одним предложением

${cardBlocks}

${spread.cardCount + 2}. ${synthesisLabel} (${synthesisWords})
   - Единая история расклада «${spread.label}»
${synthesisSubject}

${spread.cardCount + 3}. КОНКРЕТНЫЕ ДЕЙСТВИЯ (3 пункта)
   - Каждое действие — конкретное, с привязкой ко времени

ТЕСТ ПЕРСОНАЛИЗАЦИИ (внутренний — не пиши клиенту):
«Подошёл бы этот текст другому человеку?» Если да — перепиши.`;
}

function buildMarkdownOutput(spread: SpreadDefinition): string {
  const compact = spread.compactPrompt ?? spread.cardCount > 3;
  if (spread.id === "yes-no") {
    return `
ФОРМАТ ДЛЯ ДА/НЕТ:
1. Одно предложение — название карты **жирным**.
2. Вердикт: **Да**, **Нет** или **Не сейчас** — одним словом жирным.
3. 2–3 предложения объяснения.`;
  }
  if (compact) {
    return `
ФОРМАТ ВЫВОДА (Markdown):
1. Краткое введение (1–2 предложения).
2. По ${spread.cardCount} абзацев — **жирное** название каждой карты.
3. ## Простыми словами — 3–5 предложений итога.`;
  }
  return `
ФОРМАТ ВЫВОДА ДЛЯ КЛИЕНТА (Markdown — обязательно):
1. Вводное слово (1–2 предложения).
2. ${spread.cardCount} абзацев по символам — название каждого **жирным**: **Название**.
3. Заверши блоком:

## Простыми словами

3–5 предложений: суть расклада простым языком.

Запрещены скобки с действиями «(вздыхает)» и *сценические ремарки*.`;
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
  const markdown = buildMarkdownOutput(spread);
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
${markdown}
--- КОНЕЦ ИНСТРУКЦИЙ ---`;
}
