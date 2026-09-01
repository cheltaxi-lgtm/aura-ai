/** Same IANA zone as PALM_DAY_TIMEZONE — kept here so the client never imports the DB service. */
export const PALM_CADENCE_TZ = "Europe/Moscow";

function moscowDayKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PALM_CADENCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Instant when the next Moscow calendar day starts (IANA zone, no UTC-offset math). */
export function nextPalmShotAt(now = new Date()): Date {
  const todayKey = moscowDayKey(now);
  let lo = now.getTime();
  let hi = lo + 36 * 60 * 60 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (moscowDayKey(new Date(mid)) === todayKey) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/** «через 4 ч 12 мин» / «меньше чем через минуту» — until the next Moscow day. */
export function formatPalmWaitRu(now = new Date()): string {
  const ms = Math.max(0, nextPalmShotAt(now).getTime() - now.getTime());
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  if (ms < 60_000) return "меньше чем через минуту";
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours <= 0) return `через ${mins} мин`;
  if (mins === 0) return `через ${hours} ч`;
  return `через ${hours} ч ${mins} мин`;
}
