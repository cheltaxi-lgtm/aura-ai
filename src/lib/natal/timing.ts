import { calculateHouseCusps } from "celestine";
import { computeCelestinePositions, toCelestineBirthData } from "./celestine/adapter";
import { formatHouseCusps, type HouseCusp } from "./houses";
import { angularSeparation, houseForLongitude, mod360, signFromLongitude } from "./math";
import { addDaysInTimezone } from "./sky";
import { localDateStringInTimezone, parseBirthTimeToDecimal, resolveBirthUtcOffsetHours } from "./time";
import type { NatalChartRecord, NatalPlace } from "./types";

// v3: unknown-time charts no longer emit ascendant-targeted transits.
export const TIMING_ENGINE_VERSION = "timing-celestine-v3";
export const TIMING_HORIZONS = [7, 30, 90, 365] as const;
export type TimingHorizon = (typeof TIMING_HORIZONS)[number];
export type TimingCategory =
  | "identity" | "emotions" | "relationships" | "career"
  | "growth" | "pressure" | "transformation";
export type TimingSource = "celestine-transit" | "celestine-solar-return" | "secondary-progression";

export interface TimingPosition {
  key: string;
  longitude: number;
  sign: string;
  degree: number;
  retrograde: boolean;
  house?: number;
}

export interface TimingEvent {
  id: string;
  kind: "aspect" | "ingress";
  date: string;
  peakAtUtc: string;
  peakAtLocal: string;
  windowStart: string;
  windowEnd: string;
  planetKey: string;
  targetKey?: string;
  aspect?: "conjunction" | "sextile" | "square" | "trine" | "opposition";
  sign?: string;
  previousSign?: string;
  orb: number;
  maxOrb: number;
  category: TimingCategory;
  source: TimingSource;
}

export interface SolarReturnResult {
  year: number;
  exactAtUtc: string;
  exactAtLocal: string;
  timezone: string;
  location: { label: string; latitude: number; longitude: number; assumption: "natal_place" };
  positions: TimingPosition[];
  method: string;
  resolutionSeconds: number;
  // Null when birth time is unknown: the return moment inherits the natal
  // noon uncertainty (hours), so return-chart angles/houses are not reliable.
  houses: {
    system: string;
    cusps: HouseCusp[];
    ascendant: TimingPosition;
    midheaven: TimingPosition;
    warnings: string[];
  } | null;
}

export interface SecondaryProgressionResult {
  targetAtUtc: string;
  exactAgeYears: number;
  progressedAtUtc: string;
  positions: TimingPosition[];
  aspectsToNatal: Array<{
    progressedKey: string;
    natalKey: string;
    aspect: TimingEvent["aspect"];
    orb: number;
  }>;
  method: string;
  limitations: string[];
  houses: null;
  angles: null;
}

export interface PersonalTimingResult {
  version: typeof TIMING_ENGINE_VERSION;
  horizon: TimingHorizon;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  timezone: string;
  events: TimingEvent[];
  solarReturn: SolarReturnResult;
  progressions: SecondaryProgressionResult;
}

const TRANSIT_KEYS = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
const PROGRESSED_KEYS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
const NATAL_KEYS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
const ASPECTS = [
  { name: "conjunction", angle: 0, orb: 3 },
  { name: "sextile", angle: 60, orb: 2 },
  { name: "square", angle: 90, orb: 2.5 },
  { name: "trine", angle: 120, orb: 2.5 },
  { name: "opposition", angle: 180, orb: 3 },
] as const;

export function parseTimingHorizon(value: unknown): TimingHorizon | null {
  const numeric = typeof value === "string" ? Number(value) : value;
  return TIMING_HORIZONS.includes(numeric as TimingHorizon) ? numeric as TimingHorizon : null;
}

function bodyLongitude(western: Record<string, unknown>, key: string): number | null {
  const value = key === "sun" || key === "moon"
    ? western[key]
    : (western.planets as Record<string, unknown> | undefined)?.[key];
  if (!value || typeof value !== "object") return null;
  const longitude = (value as { longitude?: unknown }).longitude;
  return typeof longitude === "number" && Number.isFinite(longitude) ? mod360(longitude) : null;
}

function skyAtUtc(date: Date, place: NatalPlace) {
  return computeCelestinePositions(toCelestineBirthData({
    birthDate: date.toISOString().slice(0, 10),
    localHourDecimal: date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
    utcOffsetHours: 0,
    latitude: place.latitude,
    longitude: place.longitude,
  }));
}

type SkySnapshot = ReturnType<typeof skyAtUtc>;
export type TimingSkyProvider = (date: Date, place: NatalPlace) => SkySnapshot | Promise<SkySnapshot>;

function localIso(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`;
}

function localNoonUtc(date: string, place: NatalPlace): Date {
  const offset = resolveBirthUtcOffsetHours(date, "12:00", place.timezone);
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12 - offset));
}

function positionsFromSky(
  sky: SkySnapshot,
  keys: readonly string[] = TRANSIT_KEYS
): TimingPosition[] {
  return keys.flatMap((key) => {
    const body = sky[key];
    if (!body) return [];
    const sign = signFromLongitude(body.longitude);
    return [{
      key, longitude: Number(mod360(body.longitude).toFixed(6)), sign: sign.name,
      degree: Number(sign.degree.toFixed(6)), retrograde: body.retrograde,
    }];
  });
}

function signedAngle(value: number): number {
  const normalized = mod360(value);
  return normalized > 180 ? normalized - 360 : normalized;
}

function categoryFor(planet: string, target?: string): TimingCategory {
  if (planet === "pluto") return "transformation";
  if (planet === "saturn") return "pressure";
  if (planet === "jupiter") return "growth";
  if (target === "moon" || planet === "moon") return "emotions";
  if (target === "venus" || planet === "venus") return "relationships";
  if (target === "sun") return "identity";
  return target === "mercury" || target === "mars" ? "career" : "growth";
}

async function boundedMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await fn(items[index]);
    }
  }));
  return result;
}

export function sortTimingEvents(events: TimingEvent[]): TimingEvent[] {
  return [...events].sort((a, b) =>
    a.peakAtUtc.localeCompare(b.peakAtUtc) || a.orb - b.orb || a.id.localeCompare(b.id)
  );
}

async function refineAspectPeak(
  around: Date,
  place: NatalPlace,
  planet: string,
  natalLongitude: number,
  angle: number,
  skyProvider: TimingSkyProvider
): Promise<{ at: Date; orb: number }> {
  const objective = async (millis: number) => {
    const at = new Date(millis);
    const body = (await skyProvider(at, place))[planet];
    return body
      ? Math.abs(angularSeparation(body.longitude, natalLongitude) - angle)
      : Number.POSITIVE_INFINITY;
  };
  let lo = around.getTime() - 18 * 3_600_000;
  let hi = around.getTime() + 18 * 3_600_000;
  // A transit aspect is locally unimodal over this bounded window. Ternary
  // refinement keeps long horizons affordable while narrowing the peak to
  // a window no wider than 30 minutes.
  while (hi - lo > 30 * 60_000) {
    const left = Math.round(lo + (hi - lo) / 3);
    const right = Math.round(hi - (hi - lo) / 3);
    if (await objective(left) <= await objective(right)) hi = right;
    else lo = left;
  }
  let best = { at: new Date(lo), orb: Number.POSITIVE_INFINITY };
  for (const millis of [lo, Math.round((lo + hi) / 2), hi]) {
    const at = new Date(millis);
    const body = (await skyProvider(at, place))[planet];
    if (!body) continue;
    const orb = Math.abs(angularSeparation(body.longitude, natalLongitude) - angle);
    if (orb < best.orb || (orb === best.orb && at < best.at)) best = { at, orb };
  }
  return best;
}

async function refineIngress(
  left: Date,
  right: Date,
  place: NatalPlace,
  planet: string,
  skyProvider: TimingSkyProvider
): Promise<Date> {
  const leftSign = signFromLongitude((await skyProvider(left, place))[planet]!.longitude).index;
  let lo = left.getTime();
  let hi = right.getTime();
  while (hi - lo > 60_000) {
    const mid = Math.floor((lo + hi) / 2);
    const sign = signFromLongitude((await skyProvider(new Date(mid), place))[planet]!.longitude).index;
    if (sign === leftSign) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

export async function computeTransitTimeline(params: {
  natal: NatalChartRecord;
  horizon: TimingHorizon;
  referenceDate?: Date;
  skyProvider?: TimingSkyProvider;
}): Promise<TimingEvent[]> {
  const { natal, horizon } = params;
  if (!natal.western || !natal.place) return [];
  const skyProvider = params.skyProvider ?? skyAtUtc;
  const start = localDateStringInTimezone(natal.place.timezone, params.referenceDate ?? new Date());
  // The extra horizon+1 sample closes runs and detects boundaries crossing
  // the final requested local-calendar day.
  const dates = Array.from({ length: horizon + 2 }, (_, day) => addDaysInTimezone(natal.place!.timezone, start, day));
  const samples = await boundedMap(dates, 8, async (date) => {
    const at = localNoonUtc(date, natal.place!);
    return { date, at, sky: await skyProvider(at, natal.place!) };
  });
  const natalBodies = NATAL_KEYS.flatMap((key) => {
    const longitude = bodyLongitude(natal.western!, key);
    return longitude == null ? [] : [{ key, longitude }];
  });
  const candidates = new Map<string, Array<{ index: number; orb: number; maxOrb: number; aspect: typeof ASPECTS[number] }>>();

  for (let index = 0; index <= horizon + 1; index++) {
    for (const planet of TRANSIT_KEYS) {
      const body = samples[index].sky[planet];
      if (!body) continue;
      for (const target of natalBodies) {
        for (const aspect of ASPECTS) {
          const orb = Math.abs(angularSeparation(body.longitude, target.longitude) - aspect.angle);
          if (orb > aspect.orb) continue;
          const key = `${planet}|${target.key}|${aspect.name}`;
          const entries = candidates.get(key) ?? [];
          entries.push({ index, orb, maxOrb: aspect.orb, aspect });
          candidates.set(key, entries);
        }
      }
    }
  }

  const events: TimingEvent[] = [];
  for (const [key, entries] of candidates) {
    const [planet, target] = key.split("|");
    let run: typeof entries = [];
    const flush = async () => {
      if (!run.length) return;
      if (!run.some((entry) => entry.index <= horizon)) {
        run = [];
        return;
      }
      const samplePeak = run.reduce((best, entry) => entry.orb < best.orb ? entry : best);
      const natalLongitude = natalBodies.find((item) => item.key === target)!.longitude;
      const peak = await refineAspectPeak(
        samples[samplePeak.index].at,
        natal.place!,
        planet,
        natalLongitude,
        samplePeak.aspect.angle,
        skyProvider
      );
      const date = localDateStringInTimezone(natal.place!.timezone, peak.at);
      events.push({
        id: `aspect:${planet}:${target}:${samplePeak.aspect.name}:${date}`,
        kind: "aspect", date, peakAtUtc: peak.at.toISOString(), peakAtLocal: localIso(peak.at, natal.place!.timezone),
        windowStart: samples[run[0].index].date,
        windowEnd: samples[Math.min(horizon, run[run.length - 1].index)].date,
        planetKey: planet, targetKey: target, aspect: samplePeak.aspect.name,
        orb: Number(peak.orb.toFixed(3)), maxOrb: samplePeak.maxOrb,
        category: categoryFor(planet, target), source: "celestine-transit",
      });
      run = [];
    };
    for (const entry of entries) {
      if (run.length && entry.index > run[run.length - 1].index + 1) await flush();
      run.push(entry);
    }
    await flush();
  }

  for (let index = 0; index <= horizon; index++) {
    for (const planet of TRANSIT_KEYS) {
      const first = samples[index].sky[planet];
      const second = samples[index + 1].sky[planet];
      if (!first || !second) continue;
      const previous = signFromLongitude(first.longitude);
      const next = signFromLongitude(second.longitude);
      if (previous.index === next.index) continue;
      const peak = await refineIngress(samples[index].at, samples[index + 1].at, natal.place, planet, skyProvider);
      const date = localDateStringInTimezone(natal.place.timezone, peak);
      events.push({
        id: `ingress:${planet}:${next.name}:${date}`, kind: "ingress", date,
        peakAtUtc: peak.toISOString(), peakAtLocal: localIso(peak, natal.place.timezone),
        windowStart: date, windowEnd: date, planetKey: planet, sign: next.name,
        previousSign: previous.name, orb: 0, maxOrb: 0, category: categoryFor(planet),
        source: "celestine-transit",
      });
    }
  }
  return sortTimingEvents(events);
}

function birthInstant(birthDate: string, birthTime: string | null | undefined, place: NatalPlace): Date {
  const decimal = parseBirthTimeToDecimal(birthTime) ?? 12;
  const hour = Math.floor(decimal);
  const minute = Math.floor((decimal - hour) * 60);
  const offset = resolveBirthUtcOffsetHours(
    birthDate, `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, place.timezone
  );
  const [year, month, day] = birthDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - offset * 3_600_000);
}

export async function computeSolarReturn(params: {
  natal: NatalChartRecord;
  birthDate: string;
  year: number;
}): Promise<SolarReturnResult> {
  if (!params.natal.western || !params.natal.place) throw new Error("TIMING_CHART_INCOMPLETE");
  const natalSun = bodyLongitude(params.natal.western, "sun");
  if (natalSun == null) throw new Error("TIMING_NATAL_SUN_MISSING");
  const anchorDate = solarReturnBirthdayAnchor(params.birthDate, params.year);
  const center = localNoonUtc(anchorDate, params.natal.place).getTime();
  const samples = Array.from({ length: 29 }, (_, index) => new Date(center + (index - 14) * 6 * 3_600_000));
  let bracket: [Date, Date] | null = null;
  for (let index = 0; index < samples.length - 1; index++) {
    const a = signedAngle(skyAtUtc(samples[index], params.natal.place).sun!.longitude - natalSun);
    const b = signedAngle(skyAtUtc(samples[index + 1], params.natal.place).sun!.longitude - natalSun);
    if (a === 0 || (a < 0 && b >= 0)) {
      bracket = [samples[index], samples[index + 1]];
      break;
    }
  }
  if (!bracket) throw new Error("SOLAR_RETURN_ROOT_NOT_BRACKETED");
  let lo = bracket[0].getTime();
  let hi = bracket[1].getTime();
  const initialSign = Math.sign(signedAngle(skyAtUtc(new Date(lo), params.natal.place).sun!.longitude - natalSun));
  while (hi - lo > 1_000) {
    const mid = Math.floor((lo + hi) / 2);
    const value = signedAngle(skyAtUtc(new Date(mid), params.natal.place).sun!.longitude - natalSun);
    if (Math.sign(value) === initialSign) lo = mid;
    else hi = mid;
  }
  const exact = new Date(Math.round((lo + hi) / 2));
  const timeKnown = params.natal.timeKnown !== false;
  const exactBirthData = toCelestineBirthData({
    birthDate: exact.toISOString().slice(0, 10),
    localHourDecimal: exact.getUTCHours() + exact.getUTCMinutes() / 60 + exact.getUTCSeconds() / 3600,
    utcOffsetHours: 0,
    latitude: params.natal.place.latitude,
    longitude: params.natal.place.longitude,
  });
  const { houses: houseBlock, angles, warnings } = timeKnown
    ? calculateHouseCusps(exactBirthData, { houseSystem: "placidus" })
    : { houses: null, angles: null, warnings: [] as string[] };
  const cuspLongitudes = houseBlock ? houseBlock.cusps.map((cusp) => cusp.longitude) : null;
  const positions = positionsFromSky(skyAtUtc(exact, params.natal.place)).map((position) => ({
    ...position,
    house: cuspLongitudes ? houseForLongitude(cuspLongitudes, position.longitude) : undefined,
  }));
  const anglePosition = (key: string, longitude: number): TimingPosition => {
    const sign = signFromLongitude(longitude);
    return {
      key,
      longitude,
      sign: sign.name,
      degree: Number(sign.degree.toFixed(3)),
      retrograde: false,
    };
  };
  return {
    year: params.year, exactAtUtc: exact.toISOString(), exactAtLocal: localIso(exact, params.natal.place.timezone),
    timezone: params.natal.place.timezone,
    location: { ...params.natal.place, assumption: "natal_place" },
    positions,
    method: timeKnown
      ? "Момент возвращения найден по точному совпадению транзитного Солнца с натальным в тропическом зодиаке: поиск в шестичасовых интервалах с уточнением до 1 секунды. Дома Плацидуса рассчитаны для места рождения."
      : "Момент возвращения найден по точному совпадению транзитного Солнца с натальным в тропическом зодиаке. Время рождения неизвестно, поэтому момент возвращения приблизителен, а дома и углы карты возвращения не рассчитываются.",
    resolutionSeconds: 1,
    houses: houseBlock && angles && cuspLongitudes
      ? {
        system: houseBlock.systemName,
        cusps: formatHouseCusps(cuspLongitudes),
        ascendant: anglePosition("rising", angles.ascendant.longitude),
        midheaven: anglePosition("midheaven", angles.midheaven.longitude),
        warnings,
      }
      : null,
  };
}

/**
 * Local birthday anchor for solar-return root search. Feb-29 births use
 * Feb-28 in non-leap years; the exact return is still the solar-longitude root.
 */
export function solarReturnBirthdayAnchor(birthDate: string, year: number): string {
  const [, month, day] = birthDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function progressedInstantForTarget(birthAtUtc: Date, targetAtUtc: Date): { exactAgeYears: number; progressedAtUtc: Date } {
  if (targetAtUtc < birthAtUtc) throw new Error("PROGRESSION_TARGET_BEFORE_BIRTH");
  const tropicalYearMs = 365.2425 * 86_400_000;
  const exactAgeYears = (targetAtUtc.getTime() - birthAtUtc.getTime()) / tropicalYearMs;
  return { exactAgeYears, progressedAtUtc: new Date(birthAtUtc.getTime() + exactAgeYears * 86_400_000) };
}

export async function computeSecondaryProgressions(params: {
  natal: NatalChartRecord;
  birthDate: string;
  birthTime?: string | null;
  targetDate?: Date;
}): Promise<SecondaryProgressionResult> {
  if (!params.natal.western || !params.natal.place) throw new Error("TIMING_CHART_INCOMPLETE");
  const target = params.targetDate ?? new Date();
  const birth = birthInstant(params.birthDate, params.birthTime, params.natal.place);
  const mapped = progressedInstantForTarget(birth, target);
  const sky = skyAtUtc(mapped.progressedAtUtc, params.natal.place);
  const positions = positionsFromSky(sky, PROGRESSED_KEYS);
  const aspects: SecondaryProgressionResult["aspectsToNatal"] = [];
  for (const progressed of positions) {
    for (const natalKey of NATAL_KEYS) {
      const natalLongitude = bodyLongitude(params.natal.western, natalKey);
      if (natalLongitude == null) continue;
      const separation = angularSeparation(progressed.longitude, natalLongitude);
      const rule = ASPECTS.map((item) => ({ ...item, actualOrb: Math.abs(separation - item.angle) }))
        .filter((item) => item.actualOrb <= item.orb)
        .sort((a, b) => a.actualOrb - b.actualOrb)[0];
      if (rule) aspects.push({
        progressedKey: progressed.key, natalKey, aspect: rule.name,
        orb: Number(rule.actualOrb.toFixed(3)),
      });
    }
  }
  aspects.sort((a, b) => a.orb - b.orb || `${a.progressedKey}:${a.natalKey}`.localeCompare(`${b.progressedKey}:${b.natalKey}`));
  return {
    targetAtUtc: target.toISOString(), exactAgeYears: Number(mapped.exactAgeYears.toFixed(8)),
    progressedAtUtc: mapped.progressedAtUtc.toISOString(), positions, aspectsToNatal: aspects,
    method: "Secondary progressions, standard day-for-year: one mean tropical year of life maps to one ephemeris day after birth. Progressed Sun, Moon, and planets use the same configured major-aspect orbs as the timing aspect rules (2°–3°, by aspect).",
    limitations: [
      "Planetary longitudes are symbolic progressed positions, not current transits.",
      "Mean tropical year (365.2425 days) is used for deterministic exact-age mapping.",
      ...(!params.natal.timeKnown
        ? ["Birth time is unknown; the progression mapping uses 12:00 local time and fast-body positions are approximate."]
        : []),
      "Progressed houses and angles are intentionally omitted.",
    ],
    houses: null, angles: null,
  };
}

export async function computePersonalTiming(params: {
  natal: NatalChartRecord;
  birthDate: string;
  birthTime?: string | null;
  horizon: TimingHorizon;
  referenceDate?: Date;
}): Promise<PersonalTimingResult> {
  if (!params.natal.place) throw new Error("TIMING_CHART_INCOMPLETE");
  const reference = params.referenceDate ?? new Date();
  const start = localDateStringInTimezone(params.natal.place.timezone, reference);
  const localYear = Number(start.slice(0, 4));
  const [events, solarReturn, progressions] = await Promise.all([
    computeTransitTimeline({ natal: params.natal, horizon: params.horizon, referenceDate: reference }),
    computeSolarReturn({ natal: params.natal, birthDate: params.birthDate, year: localYear }),
    computeSecondaryProgressions({
      natal: params.natal, birthDate: params.birthDate, birthTime: params.birthTime, targetDate: reference,
    }),
  ]);
  return {
    version: TIMING_ENGINE_VERSION, horizon: params.horizon, windowStart: start,
    windowEnd: addDaysInTimezone(params.natal.place.timezone, start, params.horizon),
    generatedAt: reference.toISOString(), timezone: params.natal.place.timezone,
    events, solarReturn, progressions,
  };
}
