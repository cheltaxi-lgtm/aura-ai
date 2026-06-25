/**
 * Russian tarot card name → Rider-Waite image path (/public/tarot).
 * Keys must match names in src/lib/tarot.ts exactly.
 */

import { parseCardOrientation } from "@/lib/card-orientation";

const BASE = "/tarot";

/** Normalize lookup key (trim, unify ё→е for fallback). */
export function normalizeTarotName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function minorPaths(
  suitSlug: "cups" | "wands" | "swords" | "pentacles"
): Record<string, string> {
  const ranks = [
    "ace",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "page",
    "knight",
    "queen",
    "king",
  ] as const;

  const suitGenitive: Record<typeof suitSlug, string> = {
    cups: "Кубков",
    wands: "Жезлов",
    swords: "Мечей",
    pentacles: "Пентаклей",
  };

  const rankRu: Record<(typeof ranks)[number], string> = {
    ace: "Туз",
    two: "2",
    three: "3",
    four: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    nine: "9",
    ten: "10",
    page: "Паж",
    knight: "Рыцарь",
    queen: "Королева",
    king: "Король",
  };

  const out: Record<string, string> = {};
  for (const rank of ranks) {
    const ru = rankRu[rank];
    const label =
      rank === "ace"
        ? `Туз ${suitGenitive[suitSlug]}`
        : `${ru} ${suitGenitive[suitSlug]}`;
    out[label] = `${BASE}/${rank}-of-${suitSlug}.jpg`;
  }
  return out;
}

/** Full 78-card mapping by Russian display name. */
export const tarotImages: Record<string, string> = {
  // Major Arcana
  Шут: `${BASE}/the-fool.jpg`,
  Маг: `${BASE}/the-magician.jpg`,
  Жрица: `${BASE}/the-high-priestess.jpg`,
  Императрица: `${BASE}/the-empress.jpg`,
  Император: `${BASE}/the-emperor.jpg`,
  Иерофант: `${BASE}/the-hierophant.jpg`,
  "Влюблённые": `${BASE}/the-lovers.jpg`,
  "Влюбленные": `${BASE}/the-lovers.jpg`,
  Колесница: `${BASE}/the-chariot.jpg`,
  Сила: `${BASE}/strength.jpg`,
  Отшельник: `${BASE}/the-hermit.jpg`,
  "Колесо Фортуны": `${BASE}/wheel-of-fortune.jpg`,
  Справедливость: `${BASE}/justice.jpg`,
  Повешенный: `${BASE}/the-hanged-man.jpg`,
  Смерть: `${BASE}/death.jpg`,
  Умеренность: `${BASE}/temperance.jpg`,
  Дьявол: `${BASE}/the-devil.jpg`,
  Башня: `${BASE}/the-tower.jpg`,
  Звезда: `${BASE}/the-star.jpg`,
  Луна: `${BASE}/the-moon.jpg`,
  Солнце: `${BASE}/the-sun.jpg`,
  Суд: `${BASE}/judgement.jpg`,
  Мир: `${BASE}/the-world.jpg`,

  ...minorPaths("cups"),
  ...minorPaths("wands"),
  ...minorPaths("swords"),
  ...minorPaths("pentacles"),
};

export const TAROT_CARD_BACK = `${BASE}/_back.jpg`;

export function getTarotImagePath(cardName: string): string {
  const key = normalizeTarotName(parseCardOrientation(cardName).name);
  if (tarotImages[key]) return tarotImages[key];

  const relaxed = key.replace(/ё/g, "е");
  if (tarotImages[relaxed]) return tarotImages[relaxed];

  return TAROT_CARD_BACK;
}

export default tarotImages;
