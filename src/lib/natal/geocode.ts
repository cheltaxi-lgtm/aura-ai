import { resolveFallbackCity, searchFallbackCities, type FallbackCity } from "./cities-fallback";
import { resolveGeonamesCity, searchGeonames } from "./geonames";

export type GeocodedPlace = {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  source: "fallback" | "geonames" | "online";
};

function fromFallback(c: FallbackCity): GeocodedPlace {
  return {
    label: c.label,
    latitude: c.latitude,
    longitude: c.longitude,
    timezone: c.timezone,
    source: "fallback",
  };
}

function nearDuplicate(
  a: GeocodedPlace,
  b: { latitude: number; longitude: number }
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 0.05 &&
    Math.abs(a.longitude - b.longitude) < 0.05
  );
}

const OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

type OpenMeteoResult = {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
};

// Open-Meteo matches only in the requested language: Cyrillic input needs
// language=ru, otherwise villages like «Сафакулево» return zero results.
async function searchOpenMeteo(query: string, limit: number): Promise<GeocodedPlace[]> {
  const language = /[а-яё]/i.test(query) ? "ru" : "en";
  const url =
    `${OPEN_METEO_GEOCODE_URL}?name=${encodeURIComponent(query)}` +
    `&count=${limit}&language=${language}&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data = (await res.json()) as { results?: OpenMeteoResult[] };
  const out: GeocodedPlace[] = [];
  for (const r of data.results ?? []) {
    if (
      !r.name ||
      typeof r.latitude !== "number" ||
      typeof r.longitude !== "number" ||
      typeof r.timezone !== "string"
    ) {
      continue;
    }
    out.push({
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
      source: "online",
    });
  }
  return out;
}

async function searchOnline(query: string, limit: number): Promise<GeocodedPlace[]> {
  const direct = await searchOpenMeteo(query, limit);
  if (direct.length) return direct;
  // Open-Meteo matches place names only; «Сафакулево, Курганская область» fails,
  // so retry with the primary name before the comma.
  const primary = query.split(",")[0]?.trim();
  if (primary && primary !== query) {
    return searchOpenMeteo(primary, limit);
  }
  return [];
}

export async function searchBirthPlaces(query: string, limit = 8): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const offline = searchFallbackCities(q, limit);
  const merged = new Map<string, GeocodedPlace>();
  for (const c of offline) merged.set(c.label, fromFallback(c));

  const hasNear = (lat: number, lon: number) =>
    [...merged.values()].some((p) => nearDuplicate(p, { latitude: lat, longitude: lon }));

  for (const g of searchGeonames(q, limit)) {
    // Prefer curated / online labels over GeoNames "Potsdam, 11, DE".
    if (hasNear(g.latitude, g.longitude)) continue;
    merged.set(g.label, g);
  }

  try {
    const results = await searchOnline(q, limit);
    for (const r of results) {
      if (hasNear(r.latitude, r.longitude)) continue;
      merged.set(r.label, r);
    }
  } catch {
    // offline-only path
  }

  return [...merged.values()].slice(0, limit);
}

export async function resolveBirthPlace(city: string): Promise<GeocodedPlace | null> {
  const offline = resolveFallbackCity(city);
  if (offline) return fromFallback(offline);

  const geonames = resolveGeonamesCity(city);
  if (geonames) return geonames;

  const primaryName = city.split(",")[0]?.trim();
  if (primaryName && primaryName !== city.trim()) {
    const primaryFallback = resolveFallbackCity(primaryName);
    if (primaryFallback) return fromFallback(primaryFallback);
    const primaryGeonames = resolveGeonamesCity(primaryName);
    if (primaryGeonames) return primaryGeonames;
  }

  const hits = await searchBirthPlaces(city, 1);
  return hits[0] ?? null;
}
