/** MIT Celestine ephemeris — server-side only. */

import { calculatePlanets, type BirthData, type ChartPlanet } from "celestine";
import { resolveBirthUtcOffsetHours } from "../time";
import type { NatalPlace } from "../types";

export type SkyBody = {
  longitude: number;
  retrograde: boolean;
};

const BODY_TO_KEY: Record<string, string> = {
  Sun: "sun",
  Moon: "moon",
  Mercury: "mercury",
  Venus: "venus",
  Mars: "mars",
  Jupiter: "jupiter",
  Saturn: "saturn",
  Uranus: "uranus",
  Neptune: "neptune",
  Pluto: "pluto",
};

const CHART_OPTIONS = {
  includeAsteroids: false,
  includeChiron: false,
  includeLilith: false,
  includeNodes: false,
} as const;

export function toCelestineBirthData(params: {
  birthDate: string;
  localHourDecimal: number;
  utcOffsetHours: number;
  latitude: number;
  longitude: number;
}): BirthData {
  const [year, month, day] = params.birthDate.split("-").map(Number);
  const totalSeconds = Math.round(params.localHourDecimal * 3600);
  const hour = Math.floor(totalSeconds / 3600) % 24;
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    timezone: params.utcOffsetHours,
    latitude: params.latitude,
    longitude: params.longitude,
  };
}

export function toCelestineBirthDataAtLocalNoon(birthDate: string, place: NatalPlace): BirthData {
  return toCelestineBirthDataAtLocalTime(birthDate, place, 12);
}

export function toCelestineBirthDataAtLocalTime(
  birthDate: string,
  place: NatalPlace,
  localHourDecimal: number
): BirthData {
  const hour = Math.floor(localHourDecimal);
  const minute = Math.floor((localHourDecimal - hour) * 60);
  const timeLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const utcOffset = resolveBirthUtcOffsetHours(birthDate, timeLabel, place.timezone);
  return toCelestineBirthData({
    birthDate,
    localHourDecimal,
    utcOffsetHours: utcOffset,
    latitude: place.latitude,
    longitude: place.longitude,
  });
}

export function mapPlanetsToSky(planets: ChartPlanet[]): Partial<Record<string, SkyBody>> {
  const out: Partial<Record<string, SkyBody>> = {};
  for (const planet of planets) {
    const key = BODY_TO_KEY[planet.body] ?? BODY_TO_KEY[planet.name];
    if (!key) continue;
    out[key] = {
      longitude: planet.longitude,
      retrograde: planet.isRetrograde,
    };
  }
  return out;
}

export function computeCelestinePositions(birth: BirthData): Partial<Record<string, SkyBody>> {
  const planets = calculatePlanets(birth, CHART_OPTIONS);
  return mapPlanetsToSky(planets);
}
