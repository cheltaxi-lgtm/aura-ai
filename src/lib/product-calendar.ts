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

/** Only the authenticated worker may finish a queued reading for its original date. */
export function resolveDailyReadingRequestDate(
  requestedDate: unknown,
  trustedWorker: boolean,
  now: Date = new Date()
): string {
  if (trustedWorker && typeof requestedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return requestedDate;
  }
  return productCalendarDate(now);
}

/** Product calendar is explicit and independent of the server's TZ setting. */
export const PRODUCT_TIME_ZONE = PRODUCT_CALENDAR_TIMEZONE;

const calendarFormatters = new Map<string, Intl.DateTimeFormat>();
export function calendarParts(date = new Date(), timeZone = PRODUCT_TIME_ZONE) {
  let formatter = calendarFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    if (calendarFormatters.size >= 64) calendarFormatters.clear();
    calendarFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(p => p.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"),
    hour: value("hour"), minute: value("minute"), second: value("second") };
}

/** Calendar appointment policy: earlier fold, first real minute after a gap.
 * A completely skipped civil day returns null. Birth times use a separate,
 * strict resolver and still require the user to disambiguate a fold.
 */
export function calendarInstant(date: string, hour = 0, timeZone = PRODUCT_TIME_ZONE): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const civil = new Date(Date.UTC(year, month - 1, day));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(hour) || hour < 0 || hour >= 24 ||
      civil.getUTCFullYear() !== year || civil.getUTCMonth() !== month - 1 || civil.getUTCDate() !== day) {
    throw new Error("INVALID_CALENDAR_DATE");
  }
  const wall = Date.UTC(year, month - 1, day) + Math.round(hour * 3_600_000);
  const wallAt = (instant: number) => {
    const p = calendarParts(new Date(instant), timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  };
  const offsets = new Set<number>();
  for (let h = -48; h <= 48; h += 6) offsets.add(wallAt(wall + h * 3_600_000) - (wall + h * 3_600_000));
  const end = Date.UTC(year, month - 1, day + 1);
  for (let target = wall; target < end; target += 60_000) {
    const candidates = [...offsets].map(offset => target - offset)
      .filter(instant => wallAt(instant) === target).sort((a, b) => a - b);
    if (candidates.length) return new Date(candidates[0]);
  }
  return null;
}

export function calendarDateString(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day, 12)).toISOString().slice(0, 10);
}
