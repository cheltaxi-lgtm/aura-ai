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

/**
 * Minor arcana meanings — suit-specific, not just rank-generic.
 * Each suit carries its own element (Кубки-Вода/чувства, Жезлы-Огонь/действие,
 * Мечи-Воздух/разум, Пентакли-Земля/материя), so the same rank reads differently
 * per suit (e.g. "2" is union of hearts in Cups but a hard stalemate in Swords).
 */
const MINOR_MEANINGS: Record<"cups" | "wands" | "swords" | "pentacles", Record<string, string>> = {
  cups: {
    ace: "Начало новых чувств, любовь, эмоциональный поток",
    "2": "Союз, взаимность чувств, партнёрство сердец",
    "3": "Дружба, праздник, совместная радость",
    "4": "Апатия, скука, упущенная из-за пресыщения возможность",
    "5": "Утрата, сожаление, взгляд назад вместо вперёд",
    "6": "Ностальгия, детские воспоминания, доброта из прошлого",
    "7": "Иллюзии, соблазны, выбор среди множества фантазий",
    "8": "Уход от привычного, поиск глубины, разочарование в достигнутом",
    "9": "Удовлетворение, исполнение желания, эмоциональное довольство",
    "10": "Семейное счастье, гармония в доме, эмоциональная полнота",
    page: "Чувствительный вестник, творческое любопытство, нежное начало",
    knight: "Романтик, следует за чувствами, предложение или ухаживание",
    queen: "Эмпатия, интуитивная забота, эмоциональная мудрость",
    king: "Эмоциональная зрелость, спокойное сострадание, мудрый советчик",
  },
  wands: {
    ace: "Творческий импульс, вдохновение, новое начинание",
    "2": "Планирование, взгляд вперёд, первый выбор пути",
    "3": "Расширение, ожидание результата, дальновидность",
    "4": "Праздник, стабильность, радостное событие",
    "5": "Соперничество, мелкие конфликты, борьба за место",
    "6": "Победа, признание, успех после усилий",
    "7": "Отстаивание позиции, вызов, стойкость под давлением",
    "8": "Скорость, стремительные новости, быстрое развитие событий",
    "9": "Стойкость, усталость от борьбы, готовность к последнему рывку",
    "10": "Груз ответственности, перегрузка, доведение дела до конца",
    page: "Смелый новичок, жажда приключений, дерзкий порыв",
    knight: "Стремительный авантюрист, страсть к действию, риск",
    queen: "Уверенность, харизма, тёплое лидерство",
    king: "Вдохновляющий лидер, предприимчивость, дальновидность",
  },
  swords: {
    ace: "Ясность мысли, прорыв, острая истина",
    "2": "Тупик, трудный выбор, эмоциональная блокировка",
    "3": "Боль, разрыв, горькая правда",
    "4": "Передышка, восстановление, временное отступление",
    "5": "Конфликт без победителей, обман, пиррова победа",
    "6": "Переход к спокойствию, движение прочь от трудностей",
    "7": "Хитрость, скрытность, обходной манёвр",
    "8": "Ограничение, чувство ловушки, самообман",
    "9": "Тревога, бессонница, тяжёлые мысли",
    "10": "Дно, болезненное завершение, конец цикла страданий",
    page: "Любопытный ум, быстрые идеи, тяга к правде",
    knight: "Решительный боец за идею, прямолинейность, спешка",
    queen: "Ясность ума, независимость, честность без прикрас",
    king: "Интеллектуальный авторитет, справедливость через логику",
  },
  pentacles: {
    ace: "Новая материальная возможность, ресурс, семя изобилия",
    "2": "Баланс приоритетов, жонглирование делами, гибкость",
    "3": "Мастерство, командная работа, признание труда",
    "4": "Контроль, накопление, страх потерь",
    "5": "Нужда, трудный период, чувство исключённости",
    "6": "Щедрость, обмен ресурсами, справедливое распределение",
    "7": "Оценка результата, терпеливое ожидание урожая",
    "8": "Усердие, оттачивание мастерства, кропотливый труд",
    "9": "Независимость, комфорт, плоды собственного труда",
    "10": "Наследие, семейное благополучие, долгосрочный итог",
    page: "Прилежный ученик, практичность, первые шаги к цели",
    knight: "Надёжный труженик, методичность, медленный но верный прогресс",
    queen: "Практичная забота, хозяйственность, щедрая устойчивость",
    king: "Материальный успех, надёжность, щедрый покровитель",
  },
};

const SUITS = [
  { slug: "cups" as const, genitive: "Кубков" },
  { slug: "wands" as const, genitive: "Жезлов" },
  { slug: "swords" as const, genitive: "Мечей" },
  { slug: "pentacles" as const, genitive: "Пентаклей" },
];

const RANKS: { key: keyof typeof MINOR_MEANINGS.cups; label: string }[] = [
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
        meaning: MINOR_MEANINGS[suit.slug][rank.key],
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
