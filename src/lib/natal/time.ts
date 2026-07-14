import { resolveUtcOffset } from "natalengine";

export function parseBirthTimeToDecimal(timeRaw: string | null | undefined): number | null {
  if (!timeRaw) return null;
  const trimmed = timeRaw.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }
  return hours + minutes / 60 + seconds / 3600;
}

export function birthTimeLabel(decimalHour: number): string {
  const totalMinutes = Math.floor(decimalHour * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function resolveBirthUtcOffsetHours(
  birthDate: string,
  birthTime: string,
  timezone: string
): number {
  const timeLabel = birthTime.slice(0, 5);
  return resolveUtcOffset(birthDate, timeLabel, timezone);
}

/** YYYY-MM-DD in the birth-place IANA timezone (for transit windows). */
export function localDateStringInTimezone(timezone: string, refDate = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

export function localHourInTimezone(timezone: string, refDate = new Date()): number {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(refDate);
  return Number(value);
}
