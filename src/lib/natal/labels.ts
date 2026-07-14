import type { TimingCategory, TimingSource } from "./timing";

/** Labels intended for people; never expose calculation keys in the UI. */
export const PLANET_LABELS: Record<string, string> = {
  sun: "Солнце", moon: "Луна", mercury: "Меркурий", venus: "Венера",
  mars: "Марс", jupiter: "Юпитер", saturn: "Сатурн", uranus: "Уран",
  neptune: "Нептун", pluto: "Плутон", rahu: "Раху", ketu: "Кету",
  rising: "Асцендент", midheaven: "Середина неба", ascendant: "Лагна",
};

export const GRAHA_LABELS: Record<string, string> = {
  sun: "Сурья (Солнце)", moon: "Чандра (Луна)", mercury: "Будха (Меркурий)",
  venus: "Шукра (Венера)", mars: "Мангала (Марс)", jupiter: "Гуру (Юпитер)",
  saturn: "Шани (Сатурн)", rahu: "Раху", ketu: "Кету", ascendant: "Лагна",
};

export const SIGN_LABELS: Record<string, string> = {
  Aries: "Овен",
  Taurus: "Телец",
  Gemini: "Близнецы",
  Cancer: "Рак",
  Leo: "Лев",
  Virgo: "Дева",
  Libra: "Весы",
  Scorpio: "Скорпион",
  Sagittarius: "Стрелец",
  Capricorn: "Козерог",
  Aquarius: "Водолей",
  Pisces: "Рыбы",
};

export const TIMING_CATEGORY_LABELS: Record<TimingCategory, string> = {
  identity: "Личность", emotions: "Эмоции", relationships: "Отношения",
  career: "Карьера", growth: "Рост", pressure: "Нагрузка", transformation: "Перемены",
};

export const TIMING_SOURCE_LABELS: Record<TimingSource, string> = {
  "celestine-transit": "Расчёт транзита",
  "celestine-solar-return": "Расчёт солнечного возвращения",
  "secondary-progression": "Вторичная прогрессия",
};

export const IMPORTANCE_PLANET_KEYS = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;

export function russianPlanetLabel(key: string): string {
  return PLANET_LABELS[key] ?? "Неуказанный объект";
}

export function russianGrahaLabel(key: string): string {
  return GRAHA_LABELS[key] ?? "Неуказанная граха";
}

export function russianSignLabel(sign: string): string {
  return SIGN_LABELS[sign] ?? sign;
}
