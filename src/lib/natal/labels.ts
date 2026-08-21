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

function normalizeLabelKey(key: string): string {
  return key.trim().toLowerCase();
}

export function russianPlanetLabel(key: string): string {
  return PLANET_LABELS[normalizeLabelKey(key)] ?? "Неуказанный объект";
}

export function russianGrahaLabel(key: string): string {
  // natalengine Vimshottari lords arrive as "Venus"/"Sun"; dictionary keys are lowercase.
  return GRAHA_LABELS[normalizeLabelKey(key)] ?? "Неуказанная граха";
}

export function russianSignLabel(sign: string): string {
  return SIGN_LABELS[sign] ?? sign;
}

const ASPECT_MOOD: Record<string, string> = {
  conjunction: "тема усиливается",
  sextile: "появляется удобное окно",
  square: "нарастает трение",
  trine: "идёт легче обычного",
  opposition: "тянет в две стороны",
};

const ASPECT_NAME_RU: Record<string, string> = {
  conjunction: "соединение",
  sextile: "секстиль",
  square: "квадрат",
  trine: "трин",
  opposition: "оппозиция",
};

const CATEGORY_PLACE: Record<TimingCategory, string> = {
  identity: "в самоощущении",
  emotions: "в чувствах",
  relationships: "в отношениях",
  career: "в деле",
  growth: "в развитии",
  pressure: "в нагрузке",
  transformation: "в переменах",
};

/** One-line life meaning + short calculation detail for timing cards. */
export function describeTimingEventPlain(event: {
  kind: string;
  planetKey: string;
  targetKey?: string;
  aspect?: string | null;
  sign?: string | null;
  previousSign?: string | null;
  category: TimingCategory;
}): { headline: string; detail: string } {
  const place = CATEGORY_PLACE[event.category] ?? "в жизни";
  if (event.kind === "ingress") {
    const from = event.previousSign ? russianSignLabel(event.previousSign) : "прошлого знака";
    const to = event.sign ? russianSignLabel(event.sign) : "новый знак";
    return {
      headline: `Меняется тон ${place}`,
      detail: `${russianPlanetLabel(event.planetKey)}: ${from} → ${to}`,
    };
  }
  const mood = ASPECT_MOOD[event.aspect ?? ""] ?? "тема становится заметнее";
  const aspectRu = ASPECT_NAME_RU[event.aspect ?? ""] ?? "аспект";
  return {
    headline: `${mood} ${place}`,
    detail: `${russianPlanetLabel(event.planetKey)} к ${russianPlanetLabel(event.targetKey ?? "")} · ${aspectRu}`,
  };
}
