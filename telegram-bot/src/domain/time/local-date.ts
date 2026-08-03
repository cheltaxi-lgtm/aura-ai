import { botConfig } from "../../config.js";

export type TimezoneUser = {
  timezone_offset_minutes?: number | null;
};

/** Offset minutes → IANA-less local calendar day YYYY-MM-DD. */
export function dateKeyFromOffsetMinutes(offsetMinutes: number, at: Date = new Date()): string {
  const local = new Date(at.getTime() + offsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const d = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateKeyInTimeZone(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Single source for daily windows (triplet limit, day card, bonuses, dedupe).
 * Uses user offset when set; otherwise BOT_TZ.
 */
export function localDateKey(user: TimezoneUser | null | undefined, at: Date = new Date()): string {
  const offset = user?.timezone_offset_minutes;
  if (offset != null && Number.isFinite(offset)) {
    return dateKeyFromOffsetMinutes(offset, at);
  }
  return dateKeyInTimeZone(botConfig.timezone, at);
}
