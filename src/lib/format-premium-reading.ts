/**
 * Shared display structuring for readings/reports (chat, natal, share, joint).
 * Turns wall-of-text prose into markdown headings + numbered lists for ChatMessageRenderer.
 */

import {
  breakNumberedSteps,
  formatDestinyMatrixReadingForDisplay,
  looksLikeDestinyMatrixReading,
} from "@/lib/numerology/format-matrix-reading-display";
import { findTarotCardByName } from "@/lib/tarot";

export { breakNumberedSteps };

/** Older three-card answers put the position inside malformed bold markers.
 * Restore real card sections before Markdown rendering, including saved reads. */
const INTRO_TRIPLET_CARD_LINE_RE =
  /^[ \t]*\*\*[ \t]*([^*\n—–-]{2,64}?)[ \t]*(?:\*\*)?[ \t]*[—–-][ \t]*(прошлое|настоящее|будущее)[ \t]*[.:]?[ \t]*(?:\*\*)?[ \t]*[.:]?[ \t]*/gimu;
const INTRO_TRIPLET_POSITION_LINE_RE =
  /^[ \t]*(прошлое|настоящее|будущее)[ \t]*[—–-][ \t]*([^*\n:—–-]{2,64})[ \t]*$/gimu;
const INTRO_TRIPLET_CARD_PROSE_RE =
  /^[ \t]*\*\*[ \t]*([^*\n]{2,64}?)[ \t]*\*\*[ \t]*в[ \t]+(прошлом|настоящем|будущем)[ \t]*[—–-][ \t]*/gimu;
const PROSE_POSITION_TO_BASE: Record<string, string> = {
  прошлом: "прошлое",
  настоящем: "настоящее",
  будущем: "будущее",
};

export function formatIntroTripletCardSections(text: string): string {
  const knownCard = (value: string) => Boolean(findTarotCardByName(value.trim().replace(/^\*\*|\*\*$/g, "").replace(/[.:]$/, "")));
  const cardHeadingLines = text.split("\n").filter((line) => {
    const parts = line.trim().split(/[—–-]/u);
    return parts.length === 2 && (knownCard(parts[0] ?? "") || knownCard(parts[1] ?? ""));
  });
  const proseHeadings = [...text.matchAll(INTRO_TRIPLET_CARD_PROSE_RE)];
  // A larger spread (notably Celtic Cross) can contain these three positions
  // among other cards. Never give only part of that report the triplet layout.
  if (cardHeadingLines.length + proseHeadings.length !== 3) return text;
  const headings = [
    ...[...text.matchAll(INTRO_TRIPLET_CARD_LINE_RE)].map((match) => ({ card: match[1], position: match[2] })),
    ...[...text.matchAll(INTRO_TRIPLET_POSITION_LINE_RE)].map((match) => ({ card: match[2], position: match[1] })),
    ...proseHeadings.map((match) => ({
      card: match[1],
      position: PROSE_POSITION_TO_BASE[match[2]?.toLowerCase() ?? ""],
    })),
  ];
  const knownPositions = new Set(headings
    .filter(({ card }) => knownCard(card ?? ""))
    .map(({ position }) => position?.toLowerCase()));
  if (!["прошлое", "настоящее", "будущее"].every((position) => knownPositions.has(position))) return text;
  const labels: Record<string, string> = {
    прошлое: "Прошлое",
    настоящее: "Настоящее",
    будущее: "Будущее",
  };
  return text
    .replace(INTRO_TRIPLET_CARD_LINE_RE, (_match, card: string, position: string) =>
      knownCard(card) ? `\n\n### ${labels[position.toLowerCase()]} · ${card.trim()}\n\n` : _match
    )
    .replace(INTRO_TRIPLET_POSITION_LINE_RE, (_match, position: string, card: string) =>
      knownCard(card) ? `\n\n### ${labels[position.toLowerCase()]} · ${card.trim().replace(/[.:]$/, "")}\n\n` : _match
    )
    .replace(INTRO_TRIPLET_CARD_PROSE_RE, (_match, card: string, position: string) =>
      knownCard(card) ? `\n\n### ${labels[PROSE_POSITION_TO_BASE[position.toLowerCase()]]} · ${card.trim()}\n\n` : _match
    );
}

/** Major closing / advice blocks → ## */
const MAJOR_BARE_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог(?![\u0400-\u04FF])|Вывод(?![\u0400-\u04FF])|Совет\s+карт(?:ы)?|Практика(?:\s+на\s+(?:неделю|месяц|30\s+дней))?|Общий вывод|Ключевые выводы|Краткое резюме|Личность|Отношения|Карьера|Ресурсы|Напряжения|Текущий период|Рекомендации|Методология|Важно)\s*:?\s*(?=\S)/giu;

/** Daily / position micro-headers → ### (День ≠ Деньги). */
const DAILY_BARE_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Утро|День(?!ги)|Вечер)\s*[:—–-]\s*(?=\S)/giu;
const MINOR_BARE_HEADERS =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:✦\s*)?(Карта\s+\d+|Позиция\s+\d+|Число пути|Энергия периода|Совет чисел)\s*:?\s+(?=\S)/giu;

/** Glued section starts after a sentence end. Avoid JS `\b` on Cyrillic. */
const GLUED_SECTION_RE =
  /([.!?…»"”])\s+(?=(?:Простыми словами|Шаги(?:\s+на\s+\d+\s+дней)?|Что делать|Итог(?![\u0400-\u04FF])|Вывод(?![\u0400-\u04FF])|Практика\s*:|Утро(?![\u0400-\u04FF])|День(?!ги)|Вечер(?![\u0400-\u04FF])|Карта\s+\d+|Позиция\s+\d+|Общий вывод|Ключевые выводы))/giu;

function promoteBareHeaders(text: string): string {
  return text
    .replace(MAJOR_BARE_HEADERS, "\n\n## $1\n\n")
    .replace(DAILY_BARE_HEADERS, "\n\n### $1\n\n")
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
  const input = formatIntroTripletCardSections((raw ?? "").replace(/\r\n/g, "\n").trim());
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
