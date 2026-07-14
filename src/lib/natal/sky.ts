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

/**
 * Adds days to an already-local ISO calendar date. This is deliberately
 * timezone-independent calendar arithmetic: YYYY-MM-DD has no instant or
 * offset to convert. `timezone` is retained for call-site/API compatibility.
 */
export function addDaysInTimezone(timezone: string, dateStr: string, days: number): string {
  void timezone;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isInteger(days)) {
    throw new Error("INVALID_LOCAL_CALENDAR_DATE");
  }
  const [y, m, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, day, 12));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("INVALID_LOCAL_CALENDAR_DATE");
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
