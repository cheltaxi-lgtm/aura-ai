/**
 * Hand-curated vision-label → canonical Aura symbol name alias pairs.
 * Used to normalize OCR / vision model output for photo spread reading.
 */

export type AliasPair = readonly [string, string];

/** English RWS + Marseille / French vision labels → canonical major arcana (RU). */
export const MAJOR_VISION_ALIASES: readonly AliasPair[] = [
  // 0 — The Fool / Le Mat
  ["the fool", "Шут"],
  ["fool", "Шут"],
  ["le mat", "Шут"],
  ["mat", "Шут"],
  ["0 fool", "Шут"],
  ["0 the fool", "Шут"],
  ["0 le mat", "Шут"],
  // 1 — The Magician / Le Bateleur
  ["the magician", "Маг"],
  ["magician", "Маг"],
  ["le bateleur", "Маг"],
  ["bateleur", "Маг"],
  ["the bateleur", "Маг"],
  ["I magician", "Маг"],
  ["I the magician", "Маг"],
  // 2 — High Priestess / La Papesse
  ["the high priestess", "Жрица"],
  ["high priestess", "Жрица"],
  ["priestess", "Жрица"],
  ["the priestess", "Жрица"],
  ["papess", "Жрица"],
  ["popess", "Жрица"],
  ["la papessa", "Жрица"],
  ["la papesse", "Жрица"],
  ["papesse", "Жрица"],
  ["II high priestess", "Жрица"],
  // 3 — The Empress
  ["the empress", "Императрица"],
  ["empress", "Императрица"],
  ["l imperatrice", "Императрица"],
  ["limperatrice", "Императрица"],
  ["III empress", "Императрица"],
  // 4 — The Emperor
  ["the emperor", "Император"],
  ["emperor", "Император"],
  ["l empereur", "Император"],
  ["lempereur", "Император"],
  ["IV emperor", "Император"],
  // 5 — Hierophant / Le Pape
  ["the hierophant", "Иерофант"],
  ["hierophant", "Иерофант"],
  ["high priest", "Иерофант"],
  ["the high priest", "Иерофант"],
  ["the pope", "Иерофант"],
  ["pope", "Иерофант"],
  ["le pape", "Иерофант"],
  ["pape", "Иерофант"],
  ["V hierophant", "Иерофант"],
  // 6 — The Lovers
  ["the lovers", "Влюблённые"],
  ["lovers", "Влюблённые"],
  ["the lover", "Влюблённые"],
  ["l amoureux", "Влюблённые"],
  ["lamoureux", "Влюблённые"],
  ["amoureux", "Влюблённые"],
  ["VI lovers", "Влюблённые"],
  // 7 — The Chariot
  ["the chariot", "Колесница"],
  ["chariot", "Колесница"],
  ["le chariot", "Колесница"],
  ["VII chariot", "Колесница"],
  // 8 — Strength / La Force (RWS VIII; Marseille XI)
  ["strength", "Сила"],
  ["the strength", "Сила"],
  ["force", "Сила"],
  ["la force", "Сила"],
  ["VIII strength", "Сила"],
  ["XI force", "Сила"],
  // 9 — The Hermit
  ["the hermit", "Отшельник"],
  ["hermit", "Отшельник"],
  ["l ermite", "Отшельник"],
  ["lermite", "Отшельник"],
  ["ermite", "Отшельник"],
  ["IX hermit", "Отшельник"],
  // 10 — Wheel of Fortune
  ["wheel of fortune", "Колесо Фортуны"],
  ["the wheel of fortune", "Колесо Фортуны"],
  ["wheel", "Колесо Фортуны"],
  ["fortune", "Колесо Фортуны"],
  ["la roue de fortune", "Колесо Фортуны"],
  ["roue de fortune", "Колесо Фортуны"],
  ["X wheel of fortune", "Колесо Фортуны"],
  // 11 — Justice
  ["justice", "Справедливость"],
  ["the justice", "Справедливость"],
  ["la justice", "Справедливость"],
  ["XI justice", "Справедливость"],
  ["VIII justice", "Справедливость"],
  // 12 — The Hanged Man
  ["the hanged man", "Повешенный"],
  ["hanged man", "Повешенный"],
  ["hangman", "Повешенный"],
  ["the hangman", "Повешенный"],
  ["le pendu", "Повешенный"],
  ["pendu", "Повешенный"],
  ["XII hanged man", "Повешенный"],
  // 13 — Death
  ["death", "Смерть"],
  ["the death", "Смерть"],
  ["la mort", "Смерть"],
  ["mort", "Смерть"],
  ["XIII death", "Смерть"],
  // 14 — Temperance
  ["temperance", "Умеренность"],
  ["the temperance", "Умеренность"],
  ["l angel", "Умеренность"],
  ["lange", "Умеренность"],
  ["angel", "Умеренность"],
  ["the angel", "Умеренность"],
  ["l angelique", "Умеренность"],
  ["XIV temperance", "Умеренность"],
  // 15 — The Devil
  ["the devil", "Дьявол"],
  ["devil", "Дьявол"],
  ["le diable", "Дьявол"],
  ["diable", "Дьявол"],
  ["XV devil", "Дьявол"],
  // 16 — The Tower / La Maison Dieu
  ["the tower", "Башня"],
  ["tower", "Башня"],
  ["la maison dieu", "Башня"],
  ["maison dieu", "Башня"],
  ["house of god", "Башня"],
  ["the house of god", "Башня"],
  ["XVI tower", "Башня"],
  // 17 — The Star
  ["the star", "Звезда"],
  ["star", "Звезда"],
  ["l etoile", "Звезда"],
  ["letoile", "Звезда"],
  ["etoile", "Звезда"],
  ["XVII star", "Звезда"],
  // 18 — The Moon
  ["the moon", "Луна"],
  ["moon", "Луна"],
  ["la lune", "Луна"],
  ["lune", "Луна"],
  ["XVIII moon", "Луна"],
  // 19 — The Sun
  ["the sun", "Солнце"],
  ["sun", "Солнце"],
  ["le soleil", "Солнце"],
  ["soleil", "Солнце"],
  ["XIX sun", "Солнце"],
  // 20 — Judgement
  ["judgement", "Суд"],
  ["judgment", "Суд"],
  ["the judgement", "Суд"],
  ["the judgment", "Суд"],
  ["last judgment", "Суд"],
  ["last judgement", "Суд"],
  ["le jugement", "Суд"],
  ["jugement", "Суд"],
  ["XX judgement", "Суд"],
  // 21 — The World
  ["the world", "Мир"],
  ["world", "Мир"],
  ["le monde", "Мир"],
  ["monde", "Мир"],
  ["XXI world", "Мир"],
] as const;

/** Russian vision labels (RWS + Marseille naming) → canonical major arcana. */
export const MAJOR_RU_VISION_ALIASES: readonly AliasPair[] = [
  // 0 — Шут
  ["шут", "Шут"],
  ["дурак", "Шут"],
  ["безумец", "Шут"],
  ["0 шут", "Шут"],
  ["0 дурак", "Шут"],
  // 1 — Маг
  ["маг", "Маг"],
  ["волшебник", "Маг"],
  ["фокусник", "Маг"],
  ["I маг", "Маг"],
  // 2 — Жрица
  ["жрица", "Жрица"],
  ["верховная жрица", "Жрица"],
  ["высшая жрица", "Жрица"],
  ["папесса", "Жрица"],
  ["II жрица", "Жрица"],
  // 3 — Императрица
  ["императрица", "Императрица"],
  ["III императрица", "Императрица"],
  // 4 — Император
  ["император", "Император"],
  ["IV император", "Император"],
  // 5 — Иерофант
  ["иерофант", "Иерофант"],
  ["верховный жрец", "Иерофант"],
  ["великий иерофант", "Иерофант"],
  ["первосвященник", "Иерофант"],
  ["жрец", "Иерофант"],
  ["папа", "Иерофант"],
  ["V иерофант", "Иерофант"],
  // 6 — Влюблённые
  ["влюбленные", "Влюблённые"],
  ["влюблённые", "Влюблённые"],
  ["любовники", "Влюблённые"],
  ["любовь", "Влюблённые"],
  ["VI влюбленные", "Влюблённые"],
  // 7 — Колесница
  ["колесница", "Колесница"],
  ["VII колесница", "Колесница"],
  // 8 — Сила
  ["сила", "Сила"],
  ["VIII сила", "Сила"],
  ["XI сила", "Сила"],
  // 9 — Отшельник
  ["отшельник", "Отшельник"],
  ["IX отшельник", "Отшельник"],
  // 10 — Колесо Фортуны
  ["колесо фортуны", "Колесо Фортуны"],
  ["колесофортуны", "Колесо Фортуны"],
  ["фортуна", "Колесо Фортуны"],
  ["колесо", "Колесо Фортуны"],
  ["X колесо фортуны", "Колесо Фортуны"],
  // 11 — Справедливость
  ["справедливость", "Справедливость"],
  ["правосудие", "Справедливость"],
  ["XI справедливость", "Справедливость"],
  ["VIII справедливость", "Справедливость"],
  // 12 — Повешенный
  ["повешенный", "Повешенный"],
  ["XII повешенный", "Повешенный"],
  // 13 — Смерть
  ["смерть", "Смерть"],
  ["XIII смерть", "Смерть"],
  // 14 — Умеренность
  ["умеренность", "Умеренность"],
  ["ангел", "Умеренность"],
  ["XIV умеренность", "Умеренность"],
  // 15 — Дьявол
  ["дьявол", "Дьявол"],
  ["XV дьявол", "Дьявол"],
  // 16 — Башня
  ["башня", "Башня"],
  ["молния", "Башня"],
  ["дом божий", "Башня"],
  ["XVI башня", "Башня"],
  // 17 — Звезда
  ["звезда", "Звезда"],
  ["XVII звезда", "Звезда"],
  // 18 — Луна
  ["луна", "Луна"],
  ["XVIII луна", "Луна"],
  // 19 — Солнце
  ["солнце", "Солнце"],
  ["XIX солнце", "Солнце"],
  // 20 — Суд
  ["суд", "Суд"],
  ["последний суд", "Суд"],
  ["страшный суд", "Суд"],
  ["суд страшный", "Суд"],
  ["суд последний", "Суд"],
  ["XX суд", "Суд"],
  // 21 — Мир
  ["мир", "Мир"],
  ["вселенная", "Мир"],
  ["XXI мир", "Мир"],
] as const;

const MINOR_RANK_EN: Record<string, { label: string; num?: string }> = {
  ace: { label: "Туз", num: "1" },
  two: { label: "2", num: "2" },
  three: { label: "3", num: "3" },
  four: { label: "4", num: "4" },
  five: { label: "5", num: "5" },
  six: { label: "6", num: "6" },
  seven: { label: "7", num: "7" },
  eight: { label: "8", num: "8" },
  nine: { label: "9", num: "9" },
  ten: { label: "10", num: "10" },
  page: { label: "Паж" },
  knight: { label: "Рыцарь" },
  queen: { label: "Королева" },
  king: { label: "Король" },
};

const MINOR_RANK_RU: Record<string, string> = {
  туз: "Туз",
  "1": "Туз",
  двойка: "2",
  "2": "2",
  тройка: "3",
  "3": "3",
  четверка: "4",
  "4": "4",
  пятерка: "5",
  "5": "5",
  шестерка: "6",
  "6": "6",
  семерка: "7",
  "7": "7",
  восьмерка: "8",
  "8": "8",
  девятка: "9",
  "9": "9",
  десятка: "10",
  "10": "10",
  паж: "Паж",
  рыцарь: "Рыцарь",
  королева: "Королева",
  король: "Король",
  knave: "Паж",
  jack: "Паж",
  valet: "Паж",
};

const MINOR_SUIT_EN: Record<string, string> = {
  cups: "Кубков",
  cup: "Кубков",
  chalices: "Кубков",
  chalice: "Кубков",
  wands: "Жезлов",
  wand: "Жезлов",
  rods: "Жезлов",
  rod: "Жезлов",
  staves: "Жезлов",
  stave: "Жезлов",
  staffs: "Жезлов",
  staff: "Жезлов",
  batons: "Жезлов",
  baton: "Жезлов",
  swords: "Мечей",
  sword: "Мечей",
  blades: "Мечей",
  blade: "Мечей",
  pentacles: "Пентаклей",
  pentacle: "Пентаклей",
  coins: "Пентаклей",
  coin: "Пентаклей",
  disks: "Пентаклей",
  disk: "Пентаклей",
  deniers: "Пентаклей",
  denier: "Пентаклей",
  clubs: "Жезлов",
  spades: "Мечей",
  hearts: "Кубков",
  diamonds: "Пентаклей",
};

const MINOR_SUIT_RU: Record<string, string> = {
  кубков: "Кубков",
  кубки: "Кубков",
  чаш: "Кубков",
  чаши: "Кубков",
  чаша: "Кубков",
  жезлов: "Жезлов",
  жезлы: "Жезлов",
  посохов: "Жезлов",
  посохи: "Жезлов",
  посох: "Жезлов",
  мечей: "Мечей",
  мечи: "Мечей",
  меч: "Мечей",
  пентаклей: "Пентаклей",
  пентакл: "Пентаклей",
  пентакли: "Пентаклей",
  монет: "Пентаклей",
  монеты: "Пентаклей",
  монета: "Пентаклей",
  денариев: "Пентаклей",
  денарий: "Пентаклей",
  денарии: "Пентаклей",
};

function minorCanonical(rankLabel: string, suitGenitive: string): string {
  return rankLabel === "Туз" ? `Туз ${suitGenitive}` : `${rankLabel} ${suitGenitive}`;
}

function buildMinorVisionAliases(): AliasPair[] {
  const pairs: AliasPair[] = [];

  for (const [alias, suitGen] of Object.entries(MINOR_SUIT_EN)) {
    pairs.push([alias, suitGen]);
  }
  for (const [alias, suitGen] of Object.entries(MINOR_SUIT_RU)) {
    pairs.push([alias, suitGen]);
  }

  const rankKeys = [
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
  const suitKeys = ["cups", "wands", "swords", "pentacles"] as const;

  for (const suitKey of suitKeys) {
    const suitGen = MINOR_SUIT_EN[suitKey];
    for (const rankKey of rankKeys) {
      const rank = MINOR_RANK_EN[rankKey];
      if (!rank) continue;
      const canonical = minorCanonical(rank.label, suitGen);

      pairs.push([canonical, canonical]);
      pairs.push([`${rankKey} of ${suitKey}`, canonical]);
      pairs.push([`${rankKey} ${suitKey}`, canonical]);
      pairs.push([`${suitKey} ${rankKey}`, canonical]);
      pairs.push([`${rankKey}-of-${suitKey}`, canonical]);

      if (rank.num) {
        pairs.push([`${rank.num} of ${suitKey}`, canonical]);
        pairs.push([`${rank.num} ${suitKey}`, canonical]);
        pairs.push([`${suitKey} ${rank.num}`, canonical]);
      }

      pairs.push([`${rank.label} ${suitGen}`, canonical]);

      for (const [ruRankKey, ruRankLabel] of Object.entries(MINOR_RANK_RU)) {
        if (ruRankLabel !== rank.label) continue;
        for (const [ruSuitKey, ruSuitGen] of Object.entries(MINOR_SUIT_RU)) {
          if (ruSuitGen !== suitGen) continue;
          pairs.push([`${ruRankKey} ${ruSuitKey}`, canonical]);
          pairs.push([`${ruSuitKey} ${ruRankKey}`, canonical]);
        }
      }
    }
  }

  return pairs;
}

/** Minor arcana EN/RU suit synonyms and rank × suit vision labels. */
export const MINOR_VISION_ALIASES: readonly AliasPair[] = buildMinorVisionAliases();

/** All 24 Elder Futhark runes — transliterations and Cyrillic names. */
export const RUNE_VISION_ALIASES: readonly AliasPair[] = [
  ["fehu", "Феху"],
  ["feh", "Феху"],
  ["феху", "Феху"],
  ["uruz", "Уруз"],
  ["uruz rune", "Уруз"],
  ["уруз", "Уруз"],
  ["thurisaz", "Турисаз"],
  ["thurs", "Турисаз"],
  ["thorn", "Турисаз"],
  ["турисаз", "Турисаз"],
  ["ansuz", "Ансуз"],
  ["ansur", "Ансуз"],
  ["ansus", "Ансуз"],
  ["ансуз", "Ансуз"],
  ["raido", "Райдо"],
  ["raidho", "Райдо"],
  ["rad", "Райдо"],
  ["райдо", "Райдо"],
  ["kenaz", "Кеназ"],
  ["kaun", "Кеназ"],
  ["ken", "Кеназ"],
  ["кеназ", "Кеназ"],
  ["gebo", "Гебо"],
  ["gyfu", "Гебо"],
  ["gift", "Гебо"],
  ["гебо", "Гебо"],
  ["wunjo", "Вуньо"],
  ["wyn", "Вуньо"],
  ["wynn", "Вуньо"],
  ["вуньо", "Вуньо"],
  ["hagalaz", "Хагалаз"],
  ["hagal", "Хагалаз"],
  ["hagl", "Хагалаз"],
  ["хагалаз", "Хагалаз"],
  ["nauthiz", "Наутиз"],
  ["nyd", "Наутиз"],
  ["need", "Наутиз"],
  ["наутиз", "Наутиз"],
  ["isa", "Иса"],
  ["isaz", "Иса"],
  ["ice", "Иса"],
  ["иса", "Иса"],
  ["jera", "Йера"],
  ["jeran", "Йера"],
  ["year", "Йера"],
  ["йера", "Йера"],
  ["eihwaz", "Эйваз"],
  ["eihwaz rune", "Эйваз"],
  ["eoh", "Эйваз"],
  ["эйваз", "Эйваз"],
  ["perthro", "Перт"],
  ["perth", "Перт"],
  ["peorth", "Перт"],
  ["перт", "Перт"],
  ["algiz", "Альгиз"],
  ["elhaz", "Альгиз"],
  ["algir", "Альгиз"],
  ["альгиз", "Альгиз"],
  ["sowilo", "Соулу"],
  ["sowilu", "Соулу"],
  ["sol", "Соулу"],
  ["sun rune", "Соулу"],
  ["соулу", "Соулу"],
  ["tiwaz", "Тейваз"],
  ["tiw", "Тейваз"],
  ["tyr", "Тейваз"],
  ["тейваз", "Тейваз"],
  ["berkano", "Беркана"],
  ["berkana", "Беркана"],
  ["berkanan", "Беркана"],
  ["birch", "Беркана"],
  ["беркана", "Беркана"],
  ["ehwaz", "Эваз"],
  ["eh", "Эваз"],
  ["horse", "Эваз"],
  ["эваз", "Эваз"],
  ["mannaz", "Манназ"],
  ["man", "Манназ"],
  ["mann", "Манназ"],
  ["манназ", "Манназ"],
  ["laguz", "Лагуз"],
  ["lagu", "Лагуз"],
  ["lake", "Лагуз"],
  ["лагуз", "Лагуз"],
  ["ingwaz", "Ингуз"],
  ["ing", "Ингуз"],
  ["inguz", "Ингуз"],
  ["ингуз", "Ингуз"],
  ["dagaz", "Дагаз"],
  ["dag", "Дагаз"],
  ["day", "Дагаз"],
  ["дагаз", "Дагаз"],
  ["othala", "Отал"],
  ["odal", "Отал"],
  ["othal", "Отал"],
  ["heritage", "Отал"],
  ["отал", "Отал"],
] as const;

/** All 18 Slavic symbols — Cyrillic names, slugs, and deity variants. */
export const SLAVIC_VISION_ALIASES: readonly AliasPair[] = [
  ["mir", "Мир"],
  ["мир", "Мир"],
  ["peace", "Мир"],
  ["chernobog", "Чернобог"],
  ["cherniy bog", "Чернобог"],
  ["чернобог", "Чернобог"],
  ["чёрный бог", "Чернобог"],
  ["черный бог", "Чернобог"],
  ["alatyr", "Алатырь"],
  ["алатырь", "Алатырь"],
  ["алатир", "Алатырь"],
  ["raduga", "Радуга"],
  ["радуга", "Радуга"],
  ["rainbow", "Радуга"],
  ["nuzhda", "Нужда"],
  ["need", "Нужда"],
  ["нужда", "Нужда"],
  ["krada", "Крада"],
  ["крада", "Крада"],
  ["treba", "Треба"],
  ["треба", "Треба"],
  ["ritual", "Треба"],
  ["sila", "Сила"],
  ["сила", "Сила"],
  ["strength slavic", "Сила"],
  ["veter", "Ветер"],
  ["ветер", "Ветер"],
  ["wind", "Ветер"],
  ["bereginya", "Берегиня"],
  ["bereginia", "Берегиня"],
  ["берегиня", "Берегиня"],
  ["protectress", "Берегиня"],
  ["ud", "Уд"],
  ["уд", "Уд"],
  ["luck", "Уд"],
  ["lelya", "Леля"],
  ["леля", "Леля"],
  ["lada", "Леля"],
  ["rok", "Рок"],
  ["рок", "Рок"],
  ["fate", "Рок"],
  ["opora", "Опора"],
  ["опора", "Опора"],
  ["support", "Опора"],
  ["dazhbog", "Даждьбог"],
  ["dajbog", "Даждьбог"],
  ["dazhdbog", "Даждьбог"],
  ["даждьбог", "Даждьбог"],
  ["sun god", "Даждьбог"],
  ["perun", "Перун"],
  ["piorun", "Перун"],
  ["перун", "Перун"],
  ["thunder god", "Перун"],
  ["istok", "Исток"],
  ["исток", "Исток"],
  ["source", "Исток"],
  ["est", "Есть"],
  ["есть", "Есть"],
  ["being", "Есть"],
] as const;

/** All 21 Jyotish planets + zodiac signs — EN/RU/Sanskrit vision labels. */
export const ASTROLOGY_VISION_ALIASES: readonly AliasPair[] = [
  // Planets (9)
  ["surya", "Сурья"],
  ["sun planet", "Сурья"],
  ["сурья", "Сурья"],
  ["солнце планета", "Сурья"],
  ["chandra", "Чандра"],
  ["moon planet", "Чандра"],
  ["чандра", "Чандра"],
  ["луна планета", "Чандра"],
  ["mangala", "Мангала"],
  ["mars", "Мангала"],
  ["мангала", "Мангала"],
  ["марс", "Мангала"],
  ["budha", "Будха"],
  ["budh", "Будха"],
  ["mercury", "Будха"],
  ["будха", "Будха"],
  ["меркурий", "Будха"],
  ["guru", "Гуру"],
  ["guru jupiter", "Гуру"],
  ["jupiter", "Гуру"],
  ["brihaspati", "Гуру"],
  ["гуру", "Гуру"],
  ["юпитер", "Гуру"],
  ["shukra", "Шукра"],
  ["venus", "Шукра"],
  ["шукра", "Шукра"],
  ["венера", "Шукра"],
  ["shani", "Шани"],
  ["saturn", "Шани"],
  ["шани", "Шани"],
  ["сатурн", "Шани"],
  ["rahu", "Раху"],
  ["north node", "Раху"],
  ["rahu node", "Раху"],
  ["раху", "Раху"],
  ["восходящий узел", "Раху"],
  ["ketu", "Кету"],
  ["south node", "Кету"],
  ["ketu node", "Кету"],
  ["кету", "Кету"],
  ["нисходящий узел", "Кету"],
  // Zodiac (12)
  ["aries", "Овен"],
  ["овен", "Овен"],
  ["taurus", "Телец"],
  ["телец", "Телец"],
  ["gemini", "Близнецы"],
  ["близнецы", "Близнецы"],
  ["cancer", "Рак"],
  ["рак", "Рак"],
  ["leo", "Лев"],
  ["лев", "Лев"],
  ["virgo", "Дева"],
  ["дева", "Дева"],
  ["libra", "Весы"],
  ["весы", "Весы"],
  ["scorpio", "Скорпион"],
  ["скорпион", "Скорпион"],
  ["sagittarius", "Стрелец"],
  ["стрелец", "Стрелец"],
  ["capricorn", "Козерог"],
  ["козерог", "Козерог"],
  ["aquarius", "Водолей"],
  ["водолей", "Водолей"],
  ["pisces", "Рыбы"],
  ["рыбы", "Рыбы"],
] as const;
