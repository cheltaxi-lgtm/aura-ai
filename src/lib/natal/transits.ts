import { angularSeparation, signFromLongitude } from "./math";
import { listFacts } from "@/lib/memory/user-facts";
import { getSkyForLocalDate, addDaysInTimezone } from "./sky";
import { enrichTransitsForPrompt } from "./transit-memory";
import type { NatalChartRecord, NatalPlace } from "./types";
import { localDateStringInTimezone } from "./time";

export type TransitHit = {
  planet: string;
  planetKey?: string;
  target?: string;
  targetKey?: string;
  aspect?: string;
  previousSign?: string;
  transitSign?: string;
  kind: "sign_change" | "aspect_hit" | "memory_match";
  date?: string;
  orb?: number;
  note: string;
  relatedFacts?: string[];
};

const PLANET_LABELS: Record<string, string> = {
  sun: "Солнце",
  moon: "Луна",
  mercury: "Меркурий",
  venus: "Венера",
  mars: "Марс",
  jupiter: "Юпитер",
  saturn: "Сатурн",
};

const TRANSITING_KEYS = ["jupiter", "saturn", "mars", "sun", "mercury", "venus"] as const;
const INGRESS_NOTIFY_KEYS = new Set(["jupiter", "saturn", "mars"]);
const NATAL_TARGET_KEYS = ["sun", "moon", "mercury", "venus", "mars"] as const;

const TRANSIT_ASPECTS: Array<{ name: string; angle: number; orb: number }> = [
  { name: "conjunction", angle: 0, orb: 2.5 },
  { name: "square", angle: 90, orb: 2 },
  { name: "opposition", angle: 180, orb: 2.5 },
  { name: "trine", angle: 120, orb: 2 },
  { name: "sextile", angle: 60, orb: 1.5 },
];

function natalLongitude(western: Record<string, unknown>, key: string): number | null {
  if (key === "rising") {
    const rising = western.rising;
    if (rising && typeof rising === "object") {
      const lon = (rising as { longitude?: number }).longitude;
      return typeof lon === "number" ? lon : null;
    }
    return null;
  }
  const body =
    key === "sun" || key === "moon"
      ? western[key]
      : (western.planets as Record<string, unknown> | undefined)?.[key];
  if (!body || typeof body !== "object") return null;
  const lon = (body as { longitude?: number }).longitude;
  return typeof lon === "number" ? lon : null;
}

function collectNatalBodies(western: Record<string, unknown>): Array<{ key: string; label: string; longitude: number }> {
  const out: Array<{ key: string; label: string; longitude: number }> = [];
  for (const key of [...NATAL_TARGET_KEYS, "rising"] as const) {
    const lon = natalLongitude(western, key);
    if (lon == null) continue;
    const label = key === "rising" ? "Асцендент" : (PLANET_LABELS[key] ?? key);
    out.push({ key, label, longitude: lon });
  }
  return out;
}

function detectAspectHits(
  transitKey: string,
  transitLon: number,
  natalBodies: Array<{ key: string; label: string; longitude: number }>,
  dateStr: string
): TransitHit[] {
  const hits: TransitHit[] = [];
  const tLabel = PLANET_LABELS[transitKey] ?? transitKey;

  for (const natal of natalBodies) {
    const sep = angularSeparation(transitLon, natal.longitude);
    for (const rule of TRANSIT_ASPECTS) {
      const orb = Math.abs(sep - rule.angle);
      if (orb > rule.orb) continue;
      hits.push({
        planet: tLabel,
        planetKey: transitKey,
        target: natal.label,
        targetKey: natal.key,
        aspect: rule.name,
        kind: "aspect_hit",
        date: dateStr,
        orb: Number(orb.toFixed(2)),
        note: `Транзит ${tLabel} ${rule.name} к натальному ${natal.label} (орб ${orb.toFixed(1)}°)`,
      });
      break;
    }
  }
  return hits;
}

export function detectSignIngresses(
  endSky: Partial<Record<string, { longitude: number }>>,
  startSky: Partial<Record<string, { longitude: number }>>,
  dateStr: string
): TransitHit[] {
  const hits: TransitHit[] = [];
  for (const key of TRANSITING_KEYS) {
    const endBody = endSky[key];
    const startBody = startSky[key];
    if (!endBody || !startBody) continue;

    const endSign = signFromLongitude(endBody.longitude).name;
    const startSign = signFromLongitude(startBody.longitude).name;
    if (endSign === startSign) continue;

    const label = PLANET_LABELS[key] ?? key;
    hits.push({
      planet: label,
      planetKey: key,
      previousSign: startSign,
      transitSign: endSign,
      kind: "sign_change",
      date: dateStr,
      note: `Транзит ${label}: вход в ${endSign} (из ${startSign})`,
    });
  }
  return hits;
}

/** Aspect transits + sign ingresses for today and next N days (place timezone). */
export async function computeDeepTransits(
  natal: NatalChartRecord,
  options?: { horizonDays?: number; correlateMemory?: boolean; referenceDate?: Date }
): Promise<TransitHit[]> {
  if (!natal.western || !natal.place) return [];

  const place = natal.place;
  const horizon = options?.horizonDays ?? 7;
  const ref = options?.referenceDate ?? new Date();
  const todayStr = localDateStringInTimezone(place.timezone, ref);
  const hits: TransitHit[] = [];

  const natalBodies = collectNatalBodies(natal.western);
  const skyCache = new Map<
    string,
    Awaited<ReturnType<typeof getSkyForLocalDate>>
  >();
  const skyFor = async (dateStr: string, localHourDecimal = 12) => {
    const cacheKey = `${dateStr}|${localHourDecimal}`;
    const cached = skyCache.get(cacheKey);
    if (cached) return cached;
    const computed = await getSkyForLocalDate(dateStr, place, localHourDecimal);
    skyCache.set(cacheKey, computed);
    return computed;
  };
  for (let d = 0; d <= horizon; d++) {
    const dateStr =
      d === 0 ? todayStr : addDaysInTimezone(place.timezone, todayStr, d);
    const nextDateStr = addDaysInTimezone(place.timezone, dateStr, 1);
    const [startOfDaySky, endOfDaySky] = await Promise.all([
      skyFor(dateStr, 0),
      skyFor(nextDateStr, 0),
    ]);
    hits.push(...detectSignIngresses(endOfDaySky, startOfDaySky, dateStr));

    for (const tKey of ["jupiter", "saturn", "mars", "sun"] as const) {
      const tBody = startOfDaySky[tKey];
      if (!tBody) continue;
      hits.push(...detectAspectHits(tKey, tBody.longitude, natalBodies, dateStr));
    }
  }

  const deduped = dedupeTransits(hits);

  if (options?.correlateMemory !== false && natal.userId) {
    try {
      const facts = await listFacts(natal.userId, 40);
      return enrichTransitsForPrompt(deduped, facts);
    } catch {
      return deduped;
    }
  }
  return deduped;
}

export { INGRESS_NOTIFY_KEYS };

function dedupeTransits(hits: TransitHit[]): TransitHit[] {
  const seen = new Set<string>();
  const out: TransitHit[] = [];
  for (const h of hits) {
    const key = `${h.kind}|${h.planetKey}|${h.targetKey}|${h.aspect}|${h.date}|${h.previousSign}|${h.transitSign}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

export function localTodayForPlace(place: NatalPlace, ref = new Date()): string {
  return localDateStringInTimezone(place.timezone, ref);
}
