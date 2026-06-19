export interface TarotCard {
  id: number;
  name: string;
  arcana: "major" | "minor";
  suit?: "cups" | "wands" | "swords" | "pentacles";
  meaning: string;
}

export const MAJOR_ARCANA: TarotCard[] = [
  { id: 0, name: "Шут", arcana: "major", meaning: "Новый путь, спонтанность, риск" },
  { id: 1, name: "Маг", arcana: "major", meaning: "Воля, мастерство, проявление" },
  { id: 2, name: "Жрица", arcana: "major", meaning: "Интуиция, тайна, внутренний голос" },
  { id: 3, name: "Императрица", arcana: "major", meaning: "Изобилие, забота, творчество" },
  { id: 4, name: "Император", arcana: "major", meaning: "Структура, власть, опора" },
  { id: 5, name: "Иерофант", arcana: "major", meaning: "Традиция, наставничество, вера" },
  { id: 6, name: "Влюблённые", arcana: "major", meaning: "Выбор, союз, гармония" },
  { id: 7, name: "Колесница", arcana: "major", meaning: "Движение, победа, контроль" },
  { id: 8, name: "Сила", arcana: "major", meaning: "Мужество, страсть, мягкая сила" },
  { id: 9, name: "Отшельник", arcana: "major", meaning: "Поиск, уединение, мудрость" },
  { id: 10, name: "Колесо Фортуны", arcana: "major", meaning: "Судьба, циклы, поворот" },
  { id: 11, name: "Справедливость", arcana: "major", meaning: "Баланс, карма, истина" },
  { id: 12, name: "Повешенный", arcana: "major", meaning: "Пауза, жертва, новый взгляд" },
  { id: 13, name: "Смерть", arcana: "major", meaning: "Трансформация, завершение, обновление" },
  { id: 14, name: "Умеренность", arcana: "major", meaning: "Гармония, терпение, алхимия" },
  { id: 15, name: "Дьявол", arcana: "major", meaning: "Привязанности, соблазн, тень" },
  { id: 16, name: "Башня", arcana: "major", meaning: "Прорыв, шок, освобождение" },
  { id: 17, name: "Звезда", arcana: "major", meaning: "Надежда, исцеление, вдохновение" },
  { id: 18, name: "Луна", arcana: "major", meaning: "Иллюзии, подсознание, сны" },
  { id: 19, name: "Солнце", arcana: "major", meaning: "Радость, успех, ясность" },
  { id: 20, name: "Суд", arcana: "major", meaning: "Пробуждение, призвание, возрождение" },
  { id: 21, name: "Мир", arcana: "major", meaning: "Завершение, целостность, интеграция" },
];

const MINOR_MEANINGS: Record<string, string> = {
  ace: "Начало, потенциал, импульс",
  "2": "Баланс, выбор, партнёрство",
  "3": "Рост, сотрудничество, раскрытие",
  "4": "Стабильность, основа, пауза",
  "5": "Испытание, конфликт, перемены",
  "6": "Гармония, восстановление, щедрость",
  "7": "Размышление, стратегия, испытание терпения",
  "8": "Движение, мастерство, решимость",
  "9": "Завершение цикла, сила, награда",
  "10": "Итог, изобилие, завершённость",
  page: "Послание, любопытство, ученичество",
  knight: "Действие, импульс, движение вперёд",
  queen: "Зрелость, интуиция, забота",
  king: "Власть, мастерство, ответственность",
};

const SUITS = [
  { slug: "cups" as const, genitive: "Кубков" },
  { slug: "wands" as const, genitive: "Жезлов" },
  { slug: "swords" as const, genitive: "Мечей" },
  { slug: "pentacles" as const, genitive: "Пентаклей" },
];

const RANKS: { key: keyof typeof MINOR_MEANINGS; label: string }[] = [
  { key: "ace", label: "Туз" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: "10", label: "10" },
  { key: "page", label: "Паж" },
  { key: "knight", label: "Рыцарь" },
  { key: "queen", label: "Королева" },
  { key: "king", label: "Король" },
];

function buildMinorArcana(): TarotCard[] {
  const cards: TarotCard[] = [];
  let id = 22;
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const name =
        rank.key === "ace"
          ? `Туз ${suit.genitive}`
          : `${rank.label} ${suit.genitive}`;
      cards.push({
        id: id++,
        name,
        arcana: "minor",
        suit: suit.slug,
        meaning: MINOR_MEANINGS[rank.key],
      });
    }
  }
  return cards;
}

export const MINOR_ARCANA = buildMinorArcana();

export const FULL_DECK: TarotCard[] = [...MAJOR_ARCANA, ...MINOR_ARCANA];

export const TRIPLET_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;

export function tarotCardsKey(cards: { name: string }[] | undefined): string {
  return (cards ?? []).map((c) => c.name).join("|");
}

export function drawRandomCards(count = 3): TarotCard[] {
  const deck = [...FULL_DECK];
  const drawn: TarotCard[] = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    const idx = Math.floor(Math.random() * deck.length);
    drawn.push(deck.splice(idx, 1)[0]);
  }
  return drawn;
}

export function findTarotCardByName(name: string): TarotCard | undefined {
  const trimmed = name.trim();
  return FULL_DECK.find(
    (c) => c.name === trimmed || c.name.replace(/ё/g, "е") === trimmed.replace(/ё/g, "е")
  );
}
