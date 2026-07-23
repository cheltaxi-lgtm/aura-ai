/**
 * Shared display structuring for readings/reports (chat, natal, share, joint).
 * Turns wall-of-text prose into markdown headings + numbered lists for ChatMessageRenderer.
 */

import {
  breakNumberedSteps,
  formatDestinyMatrixReadingForDisplay,
  looksLikeDestinyMatrixReading,
} from "@/lib/numerology/format-matrix-reading-display";

export { breakNumberedSteps };

/** Major closing / advice blocks → ## */
const MAJOR_BARE_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог(?![\u0400-\u04FF])|Вывод(?![\u0400-\u04FF])|Совет\s+карт(?:ы)?|Практика(?:\s+на\s+(?:неделю|месяц|30\s+дней))?|Общий вывод|Ключевые выводы|Краткое резюме|Личность|Отношения|Карьера|Ресурсы|Напряжения|Текущий период|Рекомендации|Методология|Важно)\s*:?\s*(?=\S)/giu;

/** Daily / position micro-headers → ### (День ≠ Деньги). */
const MINOR_BARE_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Утро|День(?!ги)|Вечер|Карта\s+\d+|Позиция\s+\d+|Число пути|Энергия периода|Совет чисел)\s*:?\s+(?=\S)/giu;

/** Glued section starts after a sentence end. Avoid JS `\b` on Cyrillic. */
const GLUED_SECTION_RE =
  /([.!?…»"”])\s+(?=(?:Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог(?![\u0400-\u04FF])|Вывод(?![\u0400-\u04FF])|Практика\s*:|Утро(?![\u0400-\u04FF])|День(?!ги)|Вечер(?![\u0400-\u04FF])|Карта\s+\d+|Позиция\s+\d+|Общий вывод|Ключевые выводы))/giu;

function promoteBareHeaders(text: string): string {
  return text
    .replace(MAJOR_BARE_HEADERS, "\n\n## $1\n\n")
    .replace(MINOR_BARE_HEADERS, "\n\n### $1\n\n");
}

function highlightPracticeCues(text: string): string {
  return text
    .replace(/\s+(?=Практика\s*:)/gu, "\n\n")
    .replace(/(^|\n)(Практика\s*:)/gu, "$1**$2**");
}

/** Em-dash bullet lines → markdown list. */
function normalizeDashLists(text: string): string {
  return text.replace(/^—\s+/gm, "- ");
}

/**
 * Structure any reading/report blob for premium display.
 * Matrix-specific rules run first; then general section/list normalization.
 */
export function formatPremiumReadingForDisplay(raw: string): string {
  const input = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!input) return raw;

  if (looksLikeDestinyMatrixReading(input)) {
    return formatDestinyMatrixReadingForDisplay(input);
  }

  // Already heavily structured — only normalize steps/lists.
  if (/^#{1,3}\s/m.test(input) && (input.match(/^#{1,3}\s/gm) ?? []).length >= 2) {
    return breakNumberedSteps(normalizeDashLists(input))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  let out = input;
  out = out.replace(GLUED_SECTION_RE, "$1\n\n");
  out = promoteBareHeaders(out);
  out = breakNumberedSteps(out);
  out = highlightPracticeCues(out);
  out = normalizeDashLists(out);

  return out.replace(/\n{3,}/g, "\n\n").trim();
}
