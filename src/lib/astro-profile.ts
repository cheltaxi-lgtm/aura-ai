import { calendarParts } from "@/lib/product-calendar";
import type { ZodiacSign } from "@/utils/zodiac";
import { getZodiacFromDate } from "@/utils/zodiac";
import { parseBirthDate, reduceToSingle } from "@/lib/numerology/constants";

export type LifeFocus =
  | "love"
  | "career"
  | "health"
  | "spiritual"
  | "family"
  | "general";

export interface AstroMeta {
  birthYear: number;
  age: number;
  chineseZodiac: string;
  lifePath: number;
  element: ZodiacSign["element"];
}

export interface UserProfileInput {
  name: string;
  gender: "male" | "female";
  birthDate: string;
  zodiac: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: LifeFocus;
  mainQuestion?: string;
  astroMeta?: AstroMeta;
}

export const LIFE_FOCUS_OPTIONS: { id: LifeFocus; label: string; hint: string }[] = [
  { id: "love", label: "Любовь", hint: "отношения, партнёр, чувства" },
  { id: "career", label: "Карьера", hint: "работа, деньги, проекты" },
  { id: "health", label: "Здоровье", hint: "энергия, ресурс, баланс" },
  { id: "spiritual", label: "Путь", hint: "предназначение, карма, смысл" },
  { id: "family", label: "Семья", hint: "дом, дети, близкие" },
  { id: "general", label: "Общее", hint: "широкий взгляд на жизнь" },
];

const CHINESE_ZODIAC = [
  "Крыса",
  "Бык",
  "Тигр",
  "Кролик",
  "Дракон",
  "Змея",
  "Лошадь",
  "Коза",
  "Обезьяна",
  "Петух",
  "Собака",
  "Свинья",
];

export function getBirthYear(birthDate: string): number | null {
  return parseBirthDate(birthDate)?.year ?? null;
}

export function getAge(birthDate: string, refDate = new Date()): number | null {
  const birth = parseBirthDate(birthDate);
  if (!birth) return null;
  const now = calendarParts(refDate);
  let age = now.year - birth.year;
  if (now.month < birth.month || (now.month === birth.month && now.day < birth.day)) age--;
  return age < 0 ? null : age;
}

/** Chinese civil lunar year: the animal changes at lunar New Year, not Jan 1. */
export function getChineseZodiac(birthDate: string): string {
  const birth = parseBirthDate(birthDate);
  if (!birth) return "";
  const parts = new Intl.DateTimeFormat("en-u-ca-chinese", {
    year: "numeric", timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(birth.year, birth.month - 1, birth.day, 12)));
  const year = Number(parts.find(part => String(part.type) === "relatedYear")?.value);
  if (!Number.isInteger(year)) throw new Error("CHINESE_CALENDAR_UNAVAILABLE");
  return CHINESE_ZODIAC[((year - 4) % 12 + 12) % 12];
}

export function getLifePathNumber(birthDate: string): number {
  const parsed = parseBirthDate(birthDate);
  if (!parsed) return 0;
  const digits = `${parsed.day}${parsed.month}${parsed.year}`.replace(/\D/g, "");
  const raw = [...digits].reduce((s, d) => s + parseInt(d, 10), 0);
  const reduced = reduceToSingle(raw, true);
  return reduced;
}

export function buildAstroMeta(birthDate: string): AstroMeta | null {
  const birthYear = getBirthYear(birthDate);
  const age = getAge(birthDate);
  if (birthYear == null || age == null) return null;
  const zodiac = getZodiacFromDate(birthDate);
  if (!zodiac) return null;
  return {
    birthYear,
    age,
    chineseZodiac: getChineseZodiac(birthDate),
    lifePath: getLifePathNumber(birthDate),
    element: zodiac.element,
  };
}

export function lifeFocusLabel(focus?: LifeFocus): string | undefined {
  return LIFE_FOCUS_OPTIONS.find((o) => o.id === focus)?.label;
}
