import { FULL_DECK, MAJOR_ARCANA, type TarotCard } from "@/lib/tarot";

const MAJOR_SLUGS: Record<string, string> = {
  Шут: "shut",
  Маг: "mag",
  Жрица: "zhritsa",
  Императрица: "imperatritsa",
  Император: "imperator",
  Иерофант: "ierofant",
  "Влюблённые": "vlyublennye",
  Колесница: "kolesnitsa",
  Сила: "sila",
  Отшельник: "otshelnik",
  "Колесо Фортуны": "koleso-fortuny",
  Справедливость: "spravedlivost",
  Повешенный: "poveshennyy",
  Смерть: "smert",
  Умеренность: "umerennost",
  Дьявол: "dyavol",
  Башня: "bashnya",
  Звезда: "zvezda",
  Луна: "luna",
  Солнце: "solntse",
  Суд: "sud",
  Мир: "mir",
};

/**
 * Cyrillic → Latin transliteration map, matching the scheme already used for
 * MAJOR_SLUGS above (е/ё→e, й/ы→y, х→kh, ц→ts, ч→ch, ш→sh, щ→shch, ъ/ь→dropped,
 * ю→yu, я→ya). Minor-arcana slugs used to keep raw Cyrillic characters, which
 * self-hosted Next.js (`next start`) fails to route for dynamic segments
 * (returns 404 — see https://github.com/vercel/next.js/issues/56047), so every
 * minor-arcana card page was unreachable. Transliterating keeps URLs ASCII-only.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(text: string): string {
  return text
    .split("")
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join("");
}

function slugifyMinor(name: string): string {
  return transliterate(name.toLowerCase())
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}

export function cardSeoSlug(card: TarotCard): string {
  if (card.arcana === "major") {
    return MAJOR_SLUGS[card.name] ?? `major-${card.id}`;
  }
  return slugifyMinor(card.name);
}

export function getTarotCardBySeoSlug(slug: string): TarotCard | undefined {
  return FULL_DECK.find((c) => cardSeoSlug(c) === slug);
}

export function getAllTarotCardSeoSlugs(): string[] {
  return FULL_DECK.map((c) => cardSeoSlug(c));
}

export function getMajorTarotCards(): TarotCard[] {
  return MAJOR_ARCANA;
}

export function getFeaturedTarotCards(limit = 22): TarotCard[] {
  return MAJOR_ARCANA.slice(0, limit);
}

export function getMinorTarotCards(): TarotCard[] {
  return FULL_DECK.filter((c) => c.arcana === "minor");
}

export function getTarotCardsBySuit(suit: NonNullable<TarotCard["suit"]>): TarotCard[] {
  return FULL_DECK.filter((c) => c.suit === suit);
}
