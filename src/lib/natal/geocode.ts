import { searchPlaces as natalSearchPlaces } from "natalengine";
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

export async function searchBirthPlaces(query: string, limit = 8): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const offline = searchFallbackCities(q, limit);
  const merged = new Map<string, GeocodedPlace>();
  for (const c of offline) merged.set(c.label, fromFallback(c));

  for (const g of searchGeonames(q, limit)) {
    merged.set(g.label, g);
  }

  try {
    const results = await natalSearchPlaces(q, limit);
    for (const r of results) {
      merged.set(r.label, {
        label: r.label,
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone,
        source: "online",
      });
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
