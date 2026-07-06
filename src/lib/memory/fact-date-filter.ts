import type { UserFact } from "@/lib/memory/user-facts";

const RU_MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

/** Parse «26 июня» inside fact text (year = current). */
export function parseRussianDayMonthInText(text: string, ref: Date): Date | null {
  const m = text.match(
    /\b(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\b/i
  );
  if (!m) return null;
  const day = Number.parseInt(m[1], 10);
  const month = RU_MONTHS[m[2].toLowerCase()];
  if (month === undefined || day < 1 || day > 31) return null;
  return startOfDay(new Date(ref.getFullYear(), month, day));
}

/**
 * The day+month text fallback has no year, so `parseRussianDayMonthInText` always
 * reconstructs it against `ref`'s current year. Once the calendar rolls past the
 * date, that reconstruction jumps a full year forward and looks "upcoming" again —
 * a fact mentioning "26 декабря" would otherwise read as future forever. Treat a
 * same-year reconstruction that's implausibly far ahead as a stale wrap-around
 * from a prior year instead of a genuine near-term date.
 */
const TEXT_DATE_FAR_FUTURE_DAYS = 180;

/** True when the fact refers to an event that already happened. */
export function isPastEventFact(f: UserFact, now = new Date()): boolean {
  const today = startOfDay(now);

  if (f.eventDate) {
    const d = parseIsoDate(f.eventDate);
    if (d && d < today) return true;
    return false;
  }

  const parsed = parseRussianDayMonthInText(f.fact, now);
  if (parsed) {
    if (parsed < today) return true;
    const daysAhead = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
    if (daysAhead > TEXT_DATE_FAR_FUTURE_DAYS) return true;
  }

  return false;
}

export function filterActiveMemoryFacts(facts: UserFact[], now = new Date()): UserFact[] {
  return facts.filter((f) => !isPastEventFact(f, now));
}
