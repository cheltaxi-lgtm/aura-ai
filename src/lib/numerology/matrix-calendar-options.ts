import { matrixCalendarDateObject, matrixCalendarYmd } from "./matrix-calendar";
import type { DestinyMatrixOptions } from "./matrix-result";

export function resolveAsOf(options?: DestinyMatrixOptions): {
  year: number;
  month: number;
  date: Date;
} | null {
  const today = matrixCalendarYmd();
  let year = today.year;
  let month = today.month;
  let date = matrixCalendarDateObject();
  if (typeof options?.asOfYear === "number" && Number.isFinite(options.asOfYear)) {
    if (!Number.isInteger(options.asOfYear) || options.asOfYear < 1900 || options.asOfYear > 9999) return null;
    year = options.asOfYear;
  }
  if (typeof options?.asOfMonth === "number" && Number.isFinite(options.asOfMonth)) {
    if (!Number.isInteger(options.asOfMonth) || options.asOfMonth < 1 || options.asOfMonth > 12) return null;
    month = options.asOfMonth;
  }
  if (options?.asOfYear != null && !Number.isFinite(options.asOfYear)) return null;
  if (options?.asOfMonth != null && !Number.isFinite(options.asOfMonth)) return null;
  if (options?.asOfDate != null) {
    const parsed = parseMatrixCalendarDay(options.asOfDate);
    if (!parsed || (options.asOfYear != null && options.asOfYear !== parsed.year) || (options.asOfMonth != null && options.asOfMonth !== parsed.month)) return null;
    if (parsed) {
      date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
      year = parsed.year;
      month = parsed.month;
    }
  } else if (options?.asOfYear != null || options?.asOfMonth != null) {
    date = new Date(Date.UTC(year, month - 1, Math.min(28, today.day)));
  }
  return { year, month, date };
}

/** A forecast calendar date may be in the future; birth-date age limits do not apply. */
export function parseMatrixCalendarDay(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) ?? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const iso = value.includes("-");
  const year = Number(match[iso ? 1 : 3]);
  const month = Number(match[2]);
  const day = Number(match[iso ? 3 : 1]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? { year, month, day } : null;
}
