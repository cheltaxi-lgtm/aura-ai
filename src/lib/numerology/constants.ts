/** Core numerology constants and number meanings (RU). */

export const MASTER_NUMBERS = [11, 22, 33] as const;
export const KARMIC_DEBT_NUMBERS = [13, 14, 16, 19] as const;

export type NumerologySystem = "pythagorean" | "chaldean";

export interface NumerologyResult {
  number: number;
  isMaster: boolean;
  title: string;
  meaning: string;
  keywords: string[];
}

export const EMPTY_NUMEROLOGY_RESULT: NumerologyResult = {
  number: 0,
  isMaster: false,
  title: "—",
  meaning: "Недостаточно данных для расчёта.",
  keywords: [],
};

/** Пифагорейская таблица — кириллица (цикл 1–9). */
export const PYTHAGOREAN_CYRILLIC: Record<string, number> = {
  а: 1,
  б: 2,
  в: 3,
  г: 4,
  д: 5,
  е: 6,
  ё: 6,
  ж: 7,
  з: 8,
  и: 9,
  й: 1,
  к: 2,
  л: 3,
  м: 4,
  н: 5,
  о: 6,
  п: 7,
  р: 8,
  с: 9,
  т: 1,
  у: 2,
  ф: 3,
  х: 4,
  ц: 5,
  ч: 6,
  ш: 7,
  щ: 8,
  ъ: 9,
  ы: 1,
  ь: 2,
  э: 3,
  ю: 4,
  я: 5,
};

/** Пифагорейская таблица — латиница. */
export const PYTHAGOREAN_LATIN: Record<string, number> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
  i: 9,
  j: 1,
  k: 2,
  l: 3,
  m: 4,
  n: 5,
  o: 6,
  p: 7,
  q: 8,
  r: 9,
  s: 1,
  t: 2,
  u: 3,
  v: 4,
  w: 5,
  x: 6,
  y: 7,
  z: 8,
};

/** Халдейская таблица — кириллица (9 не используется в классической системе). */
export const CHALDEAN_CYRILLIC: Record<string, number> = {
  а: 1,
  б: 2,
  в: 3,
  г: 4,
  д: 5,
  е: 5,
  ё: 5,
  ж: 8,
  з: 7,
  и: 1,
  й: 1,
  к: 2,
  л: 3,
  м: 4,
  н: 5,
  о: 7,
  п: 8,
  р: 2,
  с: 3,
  т: 4,
  у: 6,
  ф: 8,
  х: 5,
  ц: 3,
  ч: 3,
  ш: 2,
  щ: 6,
  ъ: 1,
  ы: 1,
  ь: 1,
  э: 5,
  ю: 6,
  я: 1,
};

/** Халдейская таблица — латиница. */
export const CHALDEAN_LATIN: Record<string, number> = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 8,
  g: 3,
  h: 5,
  i: 1,
  j: 1,
  k: 2,
  l: 3,
  m: 4,
  n: 5,
  o: 7,
  p: 8,
  q: 1,
  r: 2,
  s: 3,
  t: 4,
  u: 6,
  v: 6,
  w: 6,
  x: 5,
  y: 1,
  z: 7,
};

const CYRILLIC_VOWELS = new Set("аеёиоуыэюя".split(""));
const LATIN_VOWELS = new Set("aeiouy".split(""));

export function isVowel(ch: string, system: NumerologySystem): boolean {
  const lower = ch.toLowerCase();
  if (CYRILLIC_VOWELS.has(lower)) return true;
  if (LATIN_VOWELS.has(lower)) return true;
  if (system === "chaldean" && lower === "й") return true;
  return false;
}

export function letterValue(ch: string, system: NumerologySystem): number {
  const lower = ch.toLowerCase();
  if (system === "chaldean") {
    return CHALDEAN_CYRILLIC[lower] ?? CHALDEAN_LATIN[lower] ?? 0;
  }
  return PYTHAGOREAN_CYRILLIC[lower] ?? PYTHAGOREAN_LATIN[lower] ?? 0;
}

const NUMBER_MEANINGS: Record<number, Omit<NumerologyResult, "number" | "isMaster">> = {
  1: {
    title: "Лидер",
    meaning: "Независимость, инициатива, смелость начинать. Энергия первопроходца.",
    keywords: ["лидерство", "воля", "старт", "самостоятельность"],
  },
  2: {
    title: "Дипломат",
    meaning: "Партнёрство, чувствительность, умение слышать. Сила в союзе и терпении.",
    keywords: ["союз", "гармония", "интуиция", "поддержка"],
  },
  3: {
    title: "Творец",
    meaning: "Самовыражение, радость, коммуникация. Дар вдохновлять словом и образом.",
    keywords: ["творчество", "общение", "оптимизм", "арт"],
  },
  4: {
    title: "Строитель",
    meaning: "Стабильность, труд, порядок. Фундамент через дисциплину и практичность.",
    keywords: ["структура", "надёжность", "работа", "система"],
  },
  5: {
    title: "Искатель",
    meaning: "Свобода, перемены, опыт. Жизнь через движение и новые горизонты.",
    keywords: ["свобода", "путешествие", "риск", "адаптация"],
  },
  6: {
    title: "Хранитель",
    meaning: "Семья, ответственность, забота. Гармония дома и служение близким.",
    keywords: ["семья", "любовь", "долг", "исцеление"],
  },
  7: {
    title: "Мудрец",
    meaning: "Глубина, анализ, духовный поиск. Тишина, в которой рождается истина.",
    keywords: ["мудрость", "анализ", "интуиция", "уединение"],
  },
  8: {
    title: "Властитель",
    meaning: "Материя, власть, результат. Энергия достижений и управления ресурсами.",
    keywords: ["деньги", "власть", "амбиции", "результат"],
  },
  9: {
    title: "Гуманист",
    meaning: "Завершение, сострадание, служение. Мудрость цикла и отпускание.",
    keywords: ["служение", "милосердие", "завершение", "миссия"],
  },
  11: {
    title: "Просветитель",
    meaning: "Мастер-число интуиции и вдохновения. Высокая чувствительность и духовный канал.",
    keywords: ["интуиция", "вдохновение", "мастер", "видение"],
  },
  22: {
    title: "Мастер-строитель",
    meaning: "Мастер-число великих свершений. Соединение мечты и материальной реализации.",
    keywords: ["масштаб", "реализация", "мастер", "наследие"],
  },
  33: {
    title: "Мастер-учитель",
    meaning: "Мастер-число сострадания и наставничества. Служение через любовь и мудрость.",
    keywords: ["учитель", "сострадание", "мастер", "исцеление"],
  },
};

export function buildNumerologyResult(number: number): NumerologyResult {
  if (!Number.isFinite(number) || number <= 0) {
    return { ...EMPTY_NUMEROLOGY_RESULT };
  }
  const isMaster = (MASTER_NUMBERS as readonly number[]).includes(number);
  const base = NUMBER_MEANINGS[number] ?? NUMBER_MEANINGS[reduceToSingle(number, false)] ?? {
    title: `Число ${number}`,
    meaning: "Особая вибрация, требующая личной интерпретации.",
    keywords: ["число"],
  };
  return {
    number,
    isMaster,
    title: base.title,
    meaning: base.meaning,
    keywords: base.keywords,
  };
}

export function sumDigits(n: number): number {
  return String(Math.abs(Math.trunc(n)))
    .split("")
    .reduce((acc, d) => acc + parseInt(d, 10), 0);
}

export function reduceToSingle(n: number, keepMaster = true): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  let num = Math.abs(Math.trunc(n));
  while (num > 9) {
    if (keepMaster && (MASTER_NUMBERS as readonly number[]).includes(num)) {
      return num;
    }
    num = sumDigits(num);
  }
  return num;
}

export function parseBirthDate(
  input: string | undefined | null
): { day: number; month: number; year: number } | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  let day: number;
  let month: number;
  let year: number;

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    year = parseInt(iso[1], 10);
    month = parseInt(iso[2], 10);
    day = parseInt(iso[3], 10);
  } else {
    const dotted = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (!dotted) return null;
    day = parseInt(dotted[1], 10);
    month = parseInt(dotted[2], 10);
    year = parseInt(dotted[3], 10);
  }

  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    year < 1900 ||
    year > 2100
  ) {
    return null;
  }

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }

  return { day, month, year };
}
