/** MIT Celestine ephemeris — server-side only. */

import { type BirthData, type ChartPlanet } from "celestine";
import { computeNatalSky } from "../astronomy-sky";
import { calendarInstant } from "@/lib/product-calendar";
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
  const instant = calendarInstant(birthDate, localHourDecimal, place.timezone);
  if (!instant) throw new Error("NONEXISTENT_CALENDAR_DATE");
  // Calendar sampling has a gap/fold policy; birth-time validation stays strict.
  return toCelestineBirthData({
    birthDate: instant.toISOString().slice(0, 10),
    localHourDecimal: instant.getUTCHours() + instant.getUTCMinutes() / 60 + instant.getUTCSeconds() / 3600,
    utcOffsetHours: 0,
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
  return computeNatalSky(birth);
}
