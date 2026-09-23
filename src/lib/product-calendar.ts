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
