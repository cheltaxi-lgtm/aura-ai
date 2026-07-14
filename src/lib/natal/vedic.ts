export const VEDIC_GRAHA_KEYS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "rahu",
  "ketu",
  "ascendant",
] as const;

export type VedicGrahaKey = (typeof VEDIC_GRAHA_KEYS)[number];
export type VedicHouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface VedicRashi {
  name: string;
  westernName: string;
  symbol: string;
  ruler: string;
  element: string;
  quality: "Movable" | "Fixed" | "Dual";
  index: VedicHouseNumber;
  degreeInSign: number;
}

export interface VedicNakshatra {
  number: number;
  name: string;
  lord: string;
  deity: string;
  symbol: string;
  pada: 1 | 2 | 3 | 4;
  degreeInNakshatra: number;
  startDegree: number;
  endDegree: number;
}

export interface VedicPosition {
  longitude: number;
  tropicalLongitude: number;
  degree: string;
  rashi: VedicRashi;
  nakshatra: VedicNakshatra;
}

export interface NavamsaPosition {
  longitude: number;
  rashiIndex: VedicHouseNumber;
  rashiName: string;
  westernName: string;
  symbol: string;
  degreeInSign: number;
  pada: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export interface VedicHousePlanet {
  name: string;
  degree: string;
  nakshatra: string;
}

export interface VedicHouse {
  sign: Omit<VedicRashi, "degreeInSign" | "index"> & {
    index?: VedicHouseNumber;
    degreeInSign?: number;
  };
  planets: VedicHousePlanet[];
}

export interface VimshottariPeriod {
  lord: string;
  startDate: string;
  endDate: string;
  years: number;
  isPartial: boolean;
}

export interface VimshottariDasha {
  birthLord: string;
  proportionElapsed: number;
  yearsRemaining: number;
  totalCycleYears: number;
  dashas: VimshottariPeriod[];
  current: VimshottariPeriod | null;
  authoritative: boolean;
  validationWarnings: string[];
}

export interface VedicChart {
  positions: Partial<Record<VedicGrahaKey, VedicPosition>>;
  navamsa: Partial<Record<VedicGrahaKey, NavamsaPosition>>;
  ayanamsa: { value: number; formatted: string; system: string };
  moonSign: { rashi: VedicRashi; nakshatra: VedicNakshatra; summary: string };
  dasha: VimshottariDasha;
  houses: Partial<Record<VedicHouseNumber, VedicHouse>> | null;
  julianDay: number;
  hasLocation: boolean;
  hasExactLagna: boolean;
  system: string;
  note: string;
}

const RASHIS = [
  { name: "Mesha", westernName: "Aries", symbol: "♈" },
  { name: "Vrishabha", westernName: "Taurus", symbol: "♉" },
  { name: "Mithuna", westernName: "Gemini", symbol: "♊" },
  { name: "Karka", westernName: "Cancer", symbol: "♋" },
  { name: "Simha", westernName: "Leo", symbol: "♌" },
  { name: "Kanya", westernName: "Virgo", symbol: "♍" },
  { name: "Tula", westernName: "Libra", symbol: "♎" },
  { name: "Vrishchika", westernName: "Scorpio", symbol: "♏" },
  { name: "Dhanu", westernName: "Sagittarius", symbol: "♐" },
  { name: "Makara", westernName: "Capricorn", symbol: "♑" },
  { name: "Kumbha", westernName: "Aquarius", symbol: "♒" },
  { name: "Meena", westernName: "Pisces", symbol: "♓" },
] as const;

const PADA_SPAN = 10 / 3;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateText(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function houseNumber(value: unknown): VedicHouseNumber | null {
  const number = finiteNumber(value);
  return number != null && Number.isInteger(number) && number >= 1 && number <= 12
    ? number as VedicHouseNumber
    : null;
}

function normalizeRashi(value: unknown): VedicRashi | null {
  const raw = record(value);
  if (!raw) return null;
  const index = houseNumber(raw.index);
  const degreeInSign = finiteNumber(raw.degreeInSign);
  const quality = raw.quality;
  if (
    !index || degreeInSign == null ||
    (quality !== "Movable" && quality !== "Fixed" && quality !== "Dual")
  ) return null;
  const name = text(raw.name);
  const westernName = text(raw.westernName);
  const symbol = text(raw.symbol);
  const ruler = text(raw.ruler);
  const element = text(raw.element);
  if (!name || !westernName || !symbol || !ruler || !element) return null;
  return { name, westernName, symbol, ruler, element, quality, index, degreeInSign };
}

function normalizeHouseRashi(value: unknown): VedicHouse["sign"] | null {
  const raw = record(value);
  if (!raw) return null;
  const name = text(raw.name);
  const westernName = text(raw.westernName);
  const symbol = text(raw.symbol);
  const ruler = text(raw.ruler);
  const element = text(raw.element);
  const quality = raw.quality;
  if (
    !name || !westernName || !symbol || !ruler || !element ||
    (quality !== "Movable" && quality !== "Fixed" && quality !== "Dual")
  ) return null;
  const index = houseNumber(raw.index) ?? undefined;
  const degreeInSign = finiteNumber(raw.degreeInSign) ?? undefined;
  return { name, westernName, symbol, ruler, element, quality, index, degreeInSign };
}

function normalizeNakshatra(value: unknown): VedicNakshatra | null {
  const raw = record(value);
  if (!raw) return null;
  const number = finiteNumber(raw.number);
  const pada = finiteNumber(raw.pada);
  const degreeInNakshatra = finiteNumber(raw.degreeInNakshatra);
  const startDegree = finiteNumber(raw.startDegree);
  const endDegree = finiteNumber(raw.endDegree);
  const name = text(raw.name);
  const lord = text(raw.lord);
  const deity = text(raw.deity);
  const symbol = text(raw.symbol);
  if (
    number == null || !Number.isInteger(number) || number < 1 || number > 27 ||
    pada == null || !Number.isInteger(pada) || pada < 1 || pada > 4 ||
    degreeInNakshatra == null || startDegree == null || endDegree == null ||
    !name || !lord || !deity || !symbol
  ) return null;
  return {
    number,
    name,
    lord,
    deity,
    symbol,
    pada: pada as VedicNakshatra["pada"],
    degreeInNakshatra,
    startDegree,
    endDegree,
  };
}

function normalizePosition(value: unknown): VedicPosition | null {
  const raw = record(value);
  if (!raw) return null;
  const longitude = finiteNumber(raw.longitude);
  const tropicalLongitude = finiteNumber(raw.tropicalLongitude);
  const degree = text(raw.degree);
  const rashi = normalizeRashi(raw.rashi);
  const nakshatra = normalizeNakshatra(raw.nakshatra);
  return longitude == null || tropicalLongitude == null || !degree || !rashi || !nakshatra
    ? null
    : { longitude: normalizeLongitude(longitude), tropicalLongitude, degree, rashi, nakshatra };
}

function normalizePeriod(value: unknown): VimshottariPeriod | null {
  const raw = record(value);
  if (!raw) return null;
  const lord = text(raw.lord);
  const startDate = dateText(raw.startDate);
  const endDate = dateText(raw.endDate);
  const years = finiteNumber(raw.years);
  if (!lord || !startDate || !endDate || years == null || typeof raw.isPartial !== "boolean") return null;
  return { lord, startDate, endDate, years, isPartial: raw.isPartial };
}

const VIMSHOTTARI_LORDS = [
  "Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury",
] as const;
const VIMSHOTTARI_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
const DASHA_YEAR_MS = 365.2425 * 86_400_000;

function canonicalLord(value: string): string | null {
  return VIMSHOTTARI_LORDS.find((lord) => lord.toLowerCase() === value.toLowerCase()) ?? null;
}

export function validateNormalizedVimshottari(
  dasha: Omit<VimshottariDasha, "authoritative" | "validationWarnings">,
  options: { moonNakshatraLord?: string | null; currentDate?: Date } = {}
): string[] {
  const warnings: string[] = [];
  const lords = dasha.dashas.map((period) => canonicalLord(period.lord));
  if (
    dasha.dashas.length !== 9 ||
    lords.some((lord) => lord == null) ||
    new Set(lords).size !== 9
  ) {
    warnings.push("VIMSHOTTARI_REQUIRES_NINE_UNIQUE_STANDARD_LORDS");
  }

  const birthLord = canonicalLord(dasha.birthLord);
  if (!birthLord) {
    warnings.push("VIMSHOTTARI_BIRTH_LORD_INVALID");
  } else {
    const start = VIMSHOTTARI_LORDS.indexOf(birthLord as typeof VIMSHOTTARI_LORDS[number]);
    const expected = VIMSHOTTARI_LORDS.map((_, index) => VIMSHOTTARI_LORDS[(start + index) % 9]);
    if (lords.some((lord, index) => lord !== expected[index])) {
      warnings.push("VIMSHOTTARI_LORD_SEQUENCE_INVALID");
    }
  }
  const moonLord = options.moonNakshatraLord
    ? canonicalLord(options.moonNakshatraLord)
    : null;
  if (options.moonNakshatraLord && (!moonLord || moonLord !== birthLord)) {
    warnings.push("VIMSHOTTARI_BIRTH_LORD_MOON_MISMATCH");
  }
  if (Math.abs(dasha.totalCycleYears - 120) > 0.001) {
    warnings.push("VIMSHOTTARI_TOTAL_CYCLE_NOT_120_YEARS");
  }
  if (
    dasha.proportionElapsed < 0 || dasha.proportionElapsed > 1 ||
    dasha.yearsRemaining < 0
  ) {
    warnings.push("VIMSHOTTARI_PARTIAL_VALUES_OUT_OF_RANGE");
  }

  let datesValid = true;
  for (let index = 0; index < dasha.dashas.length; index += 1) {
    const period = dasha.dashas[index];
    const start = new Date(period.startDate).getTime();
    const end = new Date(period.endDate).getTime();
    const durationYears = (end - start) / DASHA_YEAR_MS;
    if (
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      period.years <= 0 || Math.abs(durationYears - period.years) > 0.04
    ) {
      datesValid = false;
    }
    if (index > 0) {
      const previousEnd = new Date(dasha.dashas[index - 1].endDate).getTime();
      if (Math.abs(start - previousEnd) > 60_000) datesValid = false;
    }
    const expectedYears = canonicalLord(period.lord)
      ? VIMSHOTTARI_YEARS[canonicalLord(period.lord)!]
      : null;
    if (index > 0 && expectedYears != null && Math.abs(period.years - expectedYears) > 0.04) {
      datesValid = false;
    }
    if (period.isPartial !== (index === 0)) datesValid = false;
  }
  if (!datesValid) warnings.push("VIMSHOTTARI_PERIOD_DATES_OR_YEARS_INVALID");

  const first = dasha.dashas[0];
  const fullFirstYears = birthLord ? VIMSHOTTARI_YEARS[birthLord] : null;
  if (
    !first || fullFirstYears == null ||
    Math.abs(first.years - dasha.yearsRemaining) > 0.04 ||
    Math.abs(first.years - fullFirstYears * (1 - dasha.proportionElapsed)) > 0.04
  ) {
    warnings.push("VIMSHOTTARI_PARTIAL_FIRST_PERIOD_INCONSISTENT");
  }

  const now = (options.currentDate ?? new Date()).getTime();
  const containing = dasha.dashas.find((period) =>
    new Date(period.startDate).getTime() <= now && now < new Date(period.endDate).getTime()
  );
  const current = dasha.current;
  if (
    !containing || !current ||
    containing.lord !== current.lord ||
    containing.startDate !== current.startDate ||
    containing.endDate !== current.endDate ||
    !(new Date(current.startDate).getTime() <= now && now < new Date(current.endDate).getTime())
  ) {
    warnings.push("VIMSHOTTARI_CURRENT_PERIOD_INVALID");
  }
  return [...new Set(warnings)];
}

function normalizeDasha(value: unknown, moonNakshatraLord?: string | null): VimshottariDasha | null {
  const raw = record(value);
  if (!raw || !Array.isArray(raw.dashas)) return null;
  const birthLord = text(raw.birthLord);
  const rawProportionElapsed = finiteNumber(raw.proportionElapsed);
  // natalengine v1.6 documents and emits this field as a percentage (0..100).
  // The application-facing model uses a fraction (0..1).
  const proportionElapsed = rawProportionElapsed == null ? null : rawProportionElapsed / 100;
  const yearsRemaining = finiteNumber(raw.yearsRemaining);
  const totalCycleYears = finiteNumber(raw.totalCycleYears);
  const dashas = raw.dashas.map(normalizePeriod).filter((item): item is VimshottariPeriod => item !== null);
  const current = normalizePeriod(raw.current);
  if (!birthLord || proportionElapsed == null || yearsRemaining == null || totalCycleYears == null || !dashas.length) return null;
  const normalized = { birthLord, proportionElapsed, yearsRemaining, totalCycleYears, dashas, current };
  const validationWarnings = validateNormalizedVimshottari(normalized, { moonNakshatraLord });
  return {
    ...normalized,
    authoritative: validationWarnings.length === 0,
    validationWarnings,
  };
}

export function normalizeLongitude(longitude: number): number {
  return ((longitude % 360) + 360) % 360;
}

/**
 * Computes D9/Navamsa from sidereal longitude. Movable signs start from the
 * same sign, fixed signs from the ninth, and dual signs from the fifth.
 */
export function navamsaFromSiderealLongitude(longitude: number): NavamsaPosition {
  const normalized = normalizeLongitude(longitude);
  const sourceSignIndex = Math.floor(normalized / 30);
  const degreeInSourceSign = normalized - sourceSignIndex * 30;
  const padaIndex = Math.min(8, Math.floor((degreeInSourceSign + 1e-10) / PADA_SPAN));
  const modality = sourceSignIndex % 3;
  const startOffset = modality === 0 ? 0 : modality === 1 ? 8 : 4;
  const navamsaSignIndex = (sourceSignIndex + startOffset + padaIndex) % 12;
  const remainder = degreeInSourceSign - padaIndex * PADA_SPAN;
  const degreeInSign = (Math.abs(remainder) < 1e-9 ? 0 : remainder / PADA_SPAN) * 30;
  const rashi = RASHIS[navamsaSignIndex];
  return {
    longitude: navamsaSignIndex * 30 + degreeInSign,
    rashiIndex: (navamsaSignIndex + 1) as VedicHouseNumber,
    rashiName: rashi.name,
    westernName: rashi.westernName,
    symbol: rashi.symbol,
    degreeInSign,
    pada: (padaIndex + 1) as NavamsaPosition["pada"],
  };
}

export function normalizeVedicChart(
  payload: unknown,
  options: { timeKnown: boolean; hasLocation: boolean }
): VedicChart | null {
  const raw = record(payload);
  const rawPositions = record(raw?.positions);
  const rawAyanamsa = record(raw?.ayanamsa);
  const rawMoonSign = record(raw?.moonSign);
  const moonRashi = normalizeRashi(rawMoonSign?.rashi);
  const moonNakshatra = normalizeNakshatra(rawMoonSign?.nakshatra);
  const dasha = normalizeDasha(raw?.dasha, moonNakshatra?.lord);
  const ayanamsaValue = finiteNumber(rawAyanamsa?.value);
  const ayanamsaFormatted = text(rawAyanamsa?.formatted);
  const ayanamsaSystem = text(rawAyanamsa?.system);
  const julianDay = finiteNumber(raw?.julianDay);
  if (
    !raw || !rawPositions || !dasha || !moonRashi || !moonNakshatra ||
    ayanamsaValue == null || !ayanamsaFormatted || !ayanamsaSystem || julianDay == null
  ) return null;

  const hasExactLagna = options.timeKnown && options.hasLocation;
  const positions: Partial<Record<VedicGrahaKey, VedicPosition>> = {};
  const navamsa: Partial<Record<VedicGrahaKey, NavamsaPosition>> = {};
  for (const key of VEDIC_GRAHA_KEYS) {
    if (key === "ascendant" && !hasExactLagna) continue;
    const position = normalizePosition(rawPositions[key]);
    if (!position) continue;
    positions[key] = position;
    navamsa[key] = navamsaFromSiderealLongitude(position.longitude);
  }

  const houses: Partial<Record<VedicHouseNumber, VedicHouse>> = {};
  const rawHouses = hasExactLagna ? record(raw.houses) : null;
  if (rawHouses) {
    for (let index = 1; index <= 12; index += 1) {
      const rawHouse = record(rawHouses[String(index)]);
      const sign = normalizeHouseRashi(rawHouse?.sign);
      if (!rawHouse || !sign) continue;
      const planets = Array.isArray(rawHouse.planets)
        ? rawHouse.planets.flatMap((value) => {
            const planet = record(value);
            const name = text(planet?.name);
            const degree = text(planet?.degree);
            const nakshatra = text(planet?.nakshatra);
            return name && degree && nakshatra ? [{ name, degree, nakshatra }] : [];
          })
        : [];
      houses[index as VedicHouseNumber] = { sign, planets };
    }
  }

  return {
    positions,
    navamsa,
    ayanamsa: { value: ayanamsaValue, formatted: ayanamsaFormatted, system: ayanamsaSystem },
    moonSign: {
      rashi: moonRashi,
      nakshatra: moonNakshatra,
      summary: text(rawMoonSign?.summary) ?? "",
    },
    dasha,
    houses: hasExactLagna && Object.keys(houses).length ? houses : null,
    julianDay,
    hasLocation: options.hasLocation,
    hasExactLagna,
    system: text(raw.system) ?? "Vedic (Jyotish)",
    note: text(raw.note) ?? "Sidereal calculations using Lahiri Ayanamsa",
  };
}
