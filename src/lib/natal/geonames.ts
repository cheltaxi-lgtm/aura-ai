import { readFileSync, existsSync } from "fs";
import path from "path";
import type { GeocodedPlace } from "./geocode";

export type GeoCityRecord = {
  n: string;
  q: string;
  la: number;
  lo: number;
  tz: string;
  p: number;
};

let indexCache: GeoCityRecord[] | null = null;

function indexPath(): string {
  return path.join(process.cwd(), "data", "geonames", "cities.min.json");
}

function normalizeQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ё/g, "е");
}

function loadIndex(): GeoCityRecord[] {
  if (indexCache) return indexCache;
  const file = indexPath();
  if (!existsSync(file)) {
    indexCache = [];
    return indexCache;
  }
  indexCache = JSON.parse(readFileSync(file, "utf8")) as GeoCityRecord[];
  return indexCache;
}

function toPlace(c: GeoCityRecord): GeocodedPlace {
  return {
    label: c.n,
    latitude: c.la,
    longitude: c.lo,
    timezone: c.tz,
    source: "geonames",
  };
}

export function searchGeonames(query: string, limit = 8): GeocodedPlace[] {
  const q = normalizeQuery(query);
  if (q.length < 2) return [];

  const cities = loadIndex();
  if (!cities.length) return [];

  const hits: Array<{ score: number; city: GeoCityRecord }> = [];
  for (const city of cities) {
    const nq = normalizeQuery(city.n);
    const blob = city.q;
    let score = 0;
    if (nq === q || blob === q) score = 1000;
    else if (nq.startsWith(q) || blob.startsWith(q)) score = 500;
    else if (nq.includes(q) || blob.includes(q)) score = 100;
    else continue;
    score += Math.min(city.p / 100_000, 50);
    hits.push({ score, city });
  }

  hits.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: GeocodedPlace[] = [];
  for (const h of hits) {
    if (seen.has(h.city.n)) continue;
    seen.add(h.city.n);
    out.push(toPlace(h.city));
    if (out.length >= limit) break;
  }
  return out;
}

export function resolveGeonamesCity(city: string): GeocodedPlace | null {
  const hits = searchGeonames(city, 1);
  return hits[0] ?? null;
}

export function geonamesIndexLoaded(): boolean {
  return loadIndex().length > 0;
}
