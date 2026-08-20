/**
 * Server-authoritative Matrix calendar. IANA only — never UTC-offset integers.
 * Live "today" is Europe/Moscow for guest, auth, pair, forecast, Telegram, PDF.
 * Stored snapshot asOfDate is never rewritten.
 */
import { productCalendarDate } from "@/lib/product-calendar";
import { parseBirthDate } from "./constants";

export const MATRIX_CALENDAR_TIMEZONE = "Europe/Moscow";

export function matrixCalendarDate(refDate: Date = new Date()): string {
  return productCalendarDate(refDate, MATRIX_CALENDAR_TIMEZONE);
}

export function matrixCalendarYmd(refDate: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  const iso = matrixCalendarDate(refDate);
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

/** Local Date whose Y/M/D getters match the Matrix calendar day. */
export function matrixCalendarDateObject(refDate: Date = new Date()): Date {
  const { year, month, day } = matrixCalendarYmd(refDate);
  return new Date(year, month - 1, day);
}

export function matrixCalendarDateFromTimestamp(timestamp: string): string | null {
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return matrixCalendarDate(new Date(ms));
}

export function addMatrixCalendarMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12 + 12) % 12 + 1 };
}

export function isoDayFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateFromIsoDay(iso: string): Date | null {
  const parsed = parseBirthDate(iso);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}
