export interface TarotCard {
  id: number;
  name: string;
  arcana: "major";
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

export const TRIPLET_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;

export function tarotCardsKey(cards: { name: string }[] | undefined): string {
  return (cards ?? []).map((c) => c.name).join("|");
}

export function drawRandomCards(count = 3): TarotCard[] {
  const deck = [...MAJOR_ARCANA];
  const drawn: TarotCard[] = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    const idx = Math.floor(Math.random() * deck.length);
    drawn.push(deck.splice(idx, 1)[0]);
  }
  return drawn;
}
