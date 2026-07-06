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

function slugifyMinor(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "e")
    .replace(/[^a-z0-9а-я]+/gi, "-")
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
