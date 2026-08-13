/** Product calendar for daily cards / daily energy. IANA only — never UTC-offset integers. */
export const PRODUCT_CALENDAR_TIMEZONE = "Europe/Moscow";

export function productCalendarDate(
  refDate: Date = new Date(),
  timezone: string = PRODUCT_CALENDAR_TIMEZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(refDate);
}

export function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day + days);
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Instant of 00:00:00 in `timezone` on the given YYYY-MM-DD civil date.
 * Offset is derived from Intl parts — not from getTimezoneOffset() / hardcoded hours.
 */
export function zonedStartOfDay(
  ymd: string,
  timezone: string = PRODUCT_CALENDAR_TIMEZONE
): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = timezoneOffsetMs(new Date(utcGuess), timezone);
  return new Date(utcGuess - offsetMs);
}

/** Next 00:00 in the product timezone after `from` (if `from` is exactly midnight, still the following midnight). */
export function nextProductMidnight(
  from: Date = new Date(),
  timezone: string = PRODUCT_CALENDAR_TIMEZONE
): Date {
  const today = productCalendarDate(from, timezone);
  return zonedStartOfDay(addCalendarDays(today, 1), timezone);
}

export function isSameProductCalendarDay(
  a: Date | string,
  b: Date | string = new Date(),
  timezone: string = PRODUCT_CALENDAR_TIMEZONE
): boolean {
  const left = a instanceof Date ? a : new Date(a);
  const right = b instanceof Date ? b : new Date(b);
  if (!Number.isFinite(left.getTime()) || !Number.isFinite(right.getTime())) return false;
  return productCalendarDate(left, timezone) === productCalendarDate(right, timezone);
}

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second")
  );
  return asUtc - date.getTime();
}
