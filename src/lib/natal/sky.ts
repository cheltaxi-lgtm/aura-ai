import {
  computeCelestinePositions,
  toCelestineBirthDataAtLocalTime,
} from "./celestine/adapter";
import type { NatalPlace } from "./types";

export type SkyBody = {
  longitude: number;
  retrograde: boolean;
};

/** Planet longitudes at a local hour for an explicit place-local calendar date. */
export async function getSkyForLocalDate(
  birthDate: string,
  place: NatalPlace,
  localHourDecimal = 12
): Promise<Partial<Record<string, SkyBody>>> {
  const birth = toCelestineBirthDataAtLocalTime(birthDate, place, localHourDecimal);
  return computeCelestinePositions(birth);
}

export function addDaysInTimezone(timezone: string, dateStr: string, days: number): string {
  void timezone;
  const [y, m, day] = dateStr.split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, day + days, 12, 0, 0);
  return new Date(utcMs).toISOString().slice(0, 10);
}
