import type { ZodiacSign } from "@/utils/zodiac";
import { getZodiacFromDate } from "@/utils/zodiac";

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
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

export function getAge(birthDate: string): number | null {
  const year = getBirthYear(birthDate);
  if (!year) return null;
  const now = new Date();
  let age = now.getFullYear() - year;
  const month = now.getMonth();
  const day = now.getDate();
  const birth = new Date(birthDate);
  if (month < birth.getUTCMonth() || (month === birth.getUTCMonth() && day < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function getChineseZodiac(birthDate: string): string {
  const year = getBirthYear(birthDate);
  if (!year) return CHINESE_ZODIAC[0];
  const index = ((year - 4) % 12 + 12) % 12;
  return CHINESE_ZODIAC[index];
}

export function getLifePathNumber(birthDate: string): number {
  const digits = birthDate.replace(/\D/g, "");
  let sum = digits.split("").reduce((acc, d) => acc + Number(d), 0);
  while (sum > 9) {
    sum = String(sum)
      .split("")
      .reduce((acc, d) => acc + Number(d), 0);
  }
  return sum || 1;
}

export function buildAstroMeta(birthDate: string): AstroMeta | null {
  const birthYear = getBirthYear(birthDate);
  const age = getAge(birthDate);
  if (birthYear == null || age == null) return null;
  const zodiac = getZodiacFromDate(birthDate);
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
