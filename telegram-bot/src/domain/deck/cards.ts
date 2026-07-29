import type { TarotCardDef } from "./types.js";

const MAJOR: Array<[number, string, string, string]> = [
  [0, "Шут", "Новый путь, спонтанность, риск", "the-fool"],
  [1, "Маг", "Воля, мастерство, проявление", "the-magician"],
  [2, "Жрица", "Интуиция, тайна, внутренний голос", "the-high-priestess"],
  [3, "Императрица", "Изобилие, забота, творчество", "the-empress"],
  [4, "Император", "Структура, власть, опора", "the-emperor"],
  [5, "Иерофант", "Традиция, наставничество, вера", "the-hierophant"],
  [6, "Влюблённые", "Выбор, союз, гармония", "the-lovers"],
  [7, "Колесница", "Движение, победа, контроль", "the-chariot"],
  [8, "Сила", "Мужество, страсть, мягкая сила", "strength"],
  [9, "Отшельник", "Поиск, уединение, мудрость", "the-hermit"],
  [10, "Колесо Фортуны", "Судьба, циклы, поворот", "wheel-of-fortune"],
  [11, "Справедливость", "Баланс, карма, истина", "justice"],
  [12, "Повешенный", "Пауза, жертва, новый взгляд", "the-hanged-man"],
  [13, "Смерть", "Трансформация, завершение, обновление", "death"],
  [14, "Умеренность", "Гармония, терпение, алхимия", "temperance"],
  [15, "Дьявол", "Привязанности, соблазн, тень", "the-devil"],
  [16, "Башня", "Прорыв, шок, освобождение", "the-tower"],
  [17, "Звезда", "Надежда, исцеление, вдохновение", "the-star"],
  [18, "Луна", "Иллюзии, подсознание, сны", "the-moon"],
  [19, "Солнце", "Радость, успех, ясность", "the-sun"],
  [20, "Суд", "Пробуждение, призвание, возрождение", "judgement"],
  [21, "Мир", "Завершение, целостность, интеграция", "the-world"],
];

const SUITS: Array<[string, string]> = [
  ["cups", "Кубков"],
  ["wands", "Жезлов"],
  ["swords", "Мечей"],
  ["pentacles", "Пентаклей"],
];

/** Rank slug must match files in public/decks/tarot-veronika (two-of-cups.webp, …). */
const RANKS: Array<[string, string]> = [
  ["ace", "Туз"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["page", "Паж"],
  ["knight", "Рыцарь"],
  ["queen", "Королева"],
  ["king", "Король"],
];

const MINOR_MEANING =
  "Символ ситуации — уточняется в полном разборе у мастера";

function buildDeck(): TarotCardDef[] {
  const cards: TarotCardDef[] = MAJOR.map(([id, name, meaning, slug]) => ({
    id,
    name,
    meaning,
    slug,
  }));
  let id = 22;
  for (const [suitSlug, genitive] of SUITS) {
    for (const [rank, label] of RANKS) {
      const name = rank === "ace" ? `Туз ${genitive}` : `${label} ${genitive}`;
      cards.push({
        id: id++,
        name,
        meaning: MINOR_MEANING,
        slug: `${rank}-of-${suitSlug}`,
      });
    }
  }
  return cards;
}

export const FULL_DECK: TarotCardDef[] = buildDeck();
export const TRIPLET_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;
