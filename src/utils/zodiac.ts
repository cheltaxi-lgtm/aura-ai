import { parseBirthDate } from "@/lib/numerology/constants";

export interface ZodiacSign {
  name: string;
  emoji: string;
  element: "fire" | "earth" | "air" | "water";
}

export const ZODIAC_SIGNS: ZodiacSign[] = [
  { name: "Козерог", emoji: "♑", element: "earth" },
  { name: "Водолей", emoji: "♒", element: "air" },
  { name: "Рыбы", emoji: "♓", element: "water" },
  { name: "Овен", emoji: "♈", element: "fire" },
  { name: "Телец", emoji: "♉", element: "earth" },
  { name: "Близнецы", emoji: "♊", element: "air" },
  { name: "Рак", emoji: "♋", element: "water" },
  { name: "Лев", emoji: "♌", element: "fire" },
  { name: "Дева", emoji: "♍", element: "earth" },
  { name: "Весы", emoji: "♎", element: "air" },
  { name: "Скорпион", emoji: "♏", element: "water" },
  { name: "Стрелец", emoji: "♐", element: "fire" },
];

/** Normalize accepted civil-date formats before storing them in a DATE column. */
export function normalizeBirthDate(input: string): string | null {
  const parsed = parseBirthDate(input);
  return parsed
    ? `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`
    : null;
}

/** Границы знаков: [месяц, день] — начало каждого знака (кроме Козерога) */
const CUSP_DATES: [number, number][] = [
  [1, 20], [2, 19], [3, 21], [4, 20], [5, 21], [6, 21],
  [7, 23], [8, 23], [9, 23], [10, 23], [11, 22], [12, 22],
];

export function getZodiacFromDate(birthDate: string | Date): ZodiacSign | null {
  // Birthdays are civil dates. Date.parse treats dd/MM as MM/dd and normalizes
  // impossible dates; use the same strict parser as the calculation engines.
  const value = birthDate instanceof Date
    ? (Number.isNaN(birthDate.getTime()) ? "" : birthDate.toISOString().slice(0, 10))
    : birthDate;
  const parsed = parseBirthDate(value);
  if (!parsed) return null;

  const { month, day } = parsed;

  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
    return ZODIAC_SIGNS[0];
  }

  for (let i = 1; i < CUSP_DATES.length; i++) {
    const [cMonth, cDay] = CUSP_DATES[i];
    if (month < cMonth || (month === cMonth && day < cDay)) {
      return ZODIAC_SIGNS[i];
    }
  }

  return ZODIAC_SIGNS[11];
}

export function formatZodiacLabel(sign: ZodiacSign): string {
  return `${sign.name} ${sign.emoji}`;
}

/** Static deck art for sun-sign spirit (no AI generation). */
const ZODIAC_ART_SLUG: Record<string, string> = {
  Овен: "aries",
  Телец: "taurus",
  Близнецы: "gemini",
  Рак: "cancer",
  Лев: "leo",
  Дева: "virgo",
  Весы: "libra",
  Скорпион: "scorpio",
  Стрелец: "sagittarius",
  Козерог: "capricorn",
  Водолей: "aquarius",
  Рыбы: "pisces",
};

/** Accepts sign name or `formatZodiacLabel` string (`Дева ♍`). */
export function zodiacSignArtUrl(zodiac: string | ZodiacSign | null | undefined): string | null {
  if (!zodiac) return null;
  const name = typeof zodiac === "string" ? zodiac.trim().split(/\s+/)[0] : zodiac.name;
  const slug = ZODIAC_ART_SLUG[name];
  return slug ? `/decks/astrology/${slug}.webp` : null;
}

export function genderLabel(gender: "male" | "female"): string {
  return gender === "male" ? "Мужской" : "Женский";
}
