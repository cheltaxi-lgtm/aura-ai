import type { VedicChart } from "./vedic";
import { PLANET_LABELS } from "./labels";

export type NatalChartPayload = {
  birthFingerprint: string;
  timeKnown: boolean;
  place: { label: string; timezone: string } | null;
  western: Record<string, unknown> | null;
  vedic: VedicChart | null;
  transits?: Array<{ planet: string; note: string; kind: string; date?: string }>;
  warnings: string[];
  interpretation?: string;
  interpretations?: Partial<Record<"western" | "vedic", string>>;
  computedAt: string | null;
  engineVersion?: string;
};

export type VersionedPresentation = {
  birthFingerprint: string;
  engineVersion: string;
};

export function matchesCurrentChart(
  item: VersionedPresentation,
  chart: Pick<NatalChartPayload, "birthFingerprint" | "engineVersion">
): boolean {
  return Boolean(
    chart.birthFingerprint &&
    chart.engineVersion &&
    item.birthFingerprint === chart.birthFingerprint &&
    item.engineVersion === chart.engineVersion
  );
}

export type NatalInterpretationOwnershipReport = VersionedPresentation & {
  reportType: string;
  content: string;
};

/**
 * Exact current-chart ownership: a full interpretation for this
 * birthFingerprint + engineVersion. Any other chart's report does not count.
 */
export function natalInterpretationOwnsCurrentChart(
  reports: NatalInterpretationOwnershipReport[],
  chart: Pick<NatalChartPayload, "birthFingerprint" | "engineVersion">
): boolean {
  return reports.some(
    (report) =>
      report.reportType === "interpretation" &&
      Boolean(String(report.content ?? "").trim()) &&
      matchesCurrentChart(report, chart)
  );
}

export type BodyPosition = {
  key: string;
  name: string;
  glyph: string;
  sign: string;
  degree: number | null;
  house: number | null;
  retrograde: boolean;
};

export const SIGN_RU: Record<string, string> = {
  Aries: "Овен", Taurus: "Телец", Gemini: "Близнецы", Cancer: "Рак",
  Leo: "Лев", Virgo: "Дева", Libra: "Весы", Scorpio: "Скорпион",
  Sagittarius: "Стрелец", Capricorn: "Козерог", Aquarius: "Водолей", Pisces: "Рыбы",
};

export const BODY_META = [
  ["sun", "Солнце", "☉"], ["moon", "Луна", "☽"], ["mercury", "Меркурий", "☿"],
  ["venus", "Венера", "♀"], ["mars", "Марс", "♂"], ["jupiter", "Юпитер", "♃"],
  ["saturn", "Сатурн", "♄"], ["uranus", "Уран", "♅"], ["neptune", "Нептун", "♆"],
  ["pluto", "Плутон", "♇"], ["rising", "Асцендент", "ASC"], ["midheaven", "Середина неба", "MC"],
] as const;

export const BODY_NAMES: Record<string, string> = { ...PLANET_LABELS };
export const ASPECT_NAMES: Record<string, string> = {
  conjunction: "Соединение", sextile: "Секстиль", square: "Квадрат",
  trine: "Тригон", opposition: "Оппозиция", "semi-sextile": "Полусекстиль",
  quincunx: "Квинконс",
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function signName(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  if (typeof record.sign === "string") return record.sign;
  const sign = asRecord(record.sign);
  return typeof sign?.name === "string" ? sign.name : null;
}

export function signLabel(sign: string): string {
  return SIGN_RU[sign] ?? sign;
}

export function bodyFor(western: Record<string, unknown>, key: string): unknown {
  return key === "sun" || key === "moon" || key === "rising" || key === "midheaven"
    ? western[key]
    : asRecord(western.planets)?.[key];
}

export function positionRows(western: Record<string, unknown>, timeKnown: boolean): BodyPosition[] {
  const houses = asRecord(western.planetHouses);
  return BODY_META.flatMap(([key, name, glyph]) => {
    if (!timeKnown && (key === "rising" || key === "midheaven")) return [];
    const body = asRecord(bodyFor(western, key));
    const sign = signName(body);
    if (!body || !sign) return [];
    const explicitHouse = houses?.[key];
    return [{
      key, name, glyph, sign: signLabel(sign),
      degree: typeof body.degree === "number" ? body.degree : null,
      house: !timeKnown ? null : typeof explicitHouse === "number" ? explicitHouse : key === "rising" ? 1 : key === "midheaven" ? 10 : null,
      retrograde: body.retrograde === true,
    }];
  });
}

export function bigThree(western: Record<string, unknown>, timeKnown: boolean): string[] {
  const keys = [["sun", "Солнце"], ["moon", "Луна"], ...(timeKnown ? [["rising", "ASC"]] : [])];
  return keys.flatMap(([key, label]) => {
    const sign = signName(bodyFor(western, key));
    return sign ? [`${label} · ${signLabel(sign)}`] : [];
  });
}

export type AspectRow = {
  id: string; firstKey: string; secondKey: string; first: string; second: string;
  type: string; label: string; nature: string; orb: number | null;
};

export function aspectRows(western: Record<string, unknown>): AspectRow[] {
  if (!Array.isArray(western.aspects)) return [];
  return western.aspects.flatMap((item, index) => {
    const aspect = asRecord(item);
    if (!aspect || typeof aspect.planet1 !== "string" || typeof aspect.planet2 !== "string" || typeof aspect.aspect !== "string") return [];
    return [{
      id: `${aspect.planet1}-${aspect.aspect}-${aspect.planet2}-${index}`,
      firstKey: aspect.planet1, secondKey: aspect.planet2,
      first: BODY_NAMES[aspect.planet1] ?? "Неуказанный объект",
      second: BODY_NAMES[aspect.planet2] ?? "Неуказанный объект",
      type: aspect.aspect, label: ASPECT_NAMES[aspect.aspect] ?? "Неуказанный аспект",
      nature: typeof aspect.nature === "string" ? aspect.nature : "не указано",
      orb: typeof aspect.orb === "number" ? aspect.orb : null,
    }];
  });
}

export type PatternRow = { id: string; label: string; planets: string[]; note: string | null };
export function patternRows(western: Record<string, unknown>): PatternRow[] {
  if (!Array.isArray(western.patterns)) return [];
  return western.patterns.flatMap((item, index) => {
    const pattern = asRecord(item);
    if (!pattern || typeof pattern.label !== "string") return [];
    const planets = Array.isArray(pattern.planets)
      ? pattern.planets.filter((p): p is string => typeof p === "string").map((p) => BODY_NAMES[p] ?? "Неуказанный объект")
      : [];
    return [{ id: typeof pattern.id === "string" ? pattern.id : `${pattern.label}-${index}`, label: pattern.label, planets, note: typeof pattern.note === "string" ? pattern.note : null }];
  });
}

export type MidpointRow = { id: string; pair: string; sign: string; degree: number | null };
export function midpointRows(western: Record<string, unknown>): MidpointRow[] {
  if (!Array.isArray(western.midpoints)) return [];
  return western.midpoints.flatMap((item, index) => {
    const point = asRecord(item);
    if (!point || typeof point.planetA !== "string" || typeof point.planetB !== "string" || typeof point.sign !== "string") return [];
    return [{
      id: `${point.planetA}-${point.planetB}-${index}`,
      pair: `${BODY_NAMES[point.planetA] ?? point.planetA} / ${BODY_NAMES[point.planetB] ?? point.planetB}`,
      sign: signLabel(point.sign),
      degree: typeof point.degree === "number" ? point.degree : null,
    }];
  });
}

export function methodology(western: Record<string, unknown>, engineVersion?: string) {
  return {
    engine: engineVersion ?? "версия не указана",
    source: typeof western.ephemeris === "string" ? western.ephemeris : "источник не указан",
    houses: typeof western.houseSystem === "string" ? western.houseSystem : null,
    zodiac: "тропический зодиак",
  };
}
