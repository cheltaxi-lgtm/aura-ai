import { calendarParts, calendarInstant, calendarDateString, PRODUCT_TIME_ZONE } from "@/lib/product-calendar";
import type { RitualType } from "@/lib/ritual-config";
import { getMoonPhase } from "@/lib/moon";

const PLANET_BY_DOW = [
  "Солнце",
  "Луна",
  "Марс",
  "Меркурий",
  "Юпитер",
  "Венера",
  "Сатурн",
] as const;

/** Preferred weekday (0=Sun) per ritual type — planetary tradition. */
const TYPE_WEEKDAY: Record<RitualType, number[]> = {
  love: [5],
  money: [4, 0],
  protection: [6],
  luck: [3, 0],
  release: [1, 6],
  health: [0, 1],
  career: [4, 3],
};

const TYPE_HOUR: Record<RitualType, number> = {
  love: 20,
  money: 12,
  protection: 18,
  luck: 21,
  release: 22,
  health: 9,
  career: 11,
};

const TYPE_PLANET_HINT: Record<RitualType, string> = {
  love: "день Венеры усиливает притяжение",
  money: "день Юпитера открывает поток достатка",
  protection: "Сатурн укрепляет границы и защиту",
  luck: "Меркурий и Солнце активируют удачу",
  release: "Луна и Сатурн помогают отпустить",
  health: "Солнце и Луна поддерживают восстановление сил",
  career: "Юпитер и Меркурий открывают путь к успеху",
};

export function formatRitualCalendarDate(date: Date, timeZone = PRODUCT_TIME_ZONE): string {
  const dayMonthYear = date.toLocaleDateString("ru-RU", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const weekday = date.toLocaleDateString("ru-RU", { weekday: "long", timeZone });
  return `${dayMonthYear}, ${weekday}`;
}

export function formatRitualTimeLabel(date: Date, timeZone = PRODUCT_TIME_ZONE): string {
  const h = calendarParts(date, timeZone).hour.toString().padStart(2, "0");
  const m = calendarParts(date, timeZone).minute.toString().padStart(2, "0");
  return `${formatRitualCalendarDate(date, timeZone)}, ${h}:${m}`;
}

export interface RitualSchedule {
  at: Date;
  label: string;
  moonPhase: string;
  moonSign: string;
  factors: string[];
}

/**
 * Picks the nearest calendar moment when moon phase favours this ritual type
 * and planetary weekday matches tradition.
 */
export function computeRitualSchedule(
  ritualType: RitualType,
  fromDate: Date = new Date(),
  timeZone = PRODUCT_TIME_ZONE
): RitualSchedule {
  const from = calendarParts(fromDate, timeZone);
  let best: { day: Date; score: number; moon: ReturnType<typeof getMoonPhase> } | null =
    null;

  for (let offset = 0; offset <= 28; offset++) {
    const civilDate = calendarDateString(from.year, from.month, from.day + offset);
    const day = calendarInstant(civilDate, TYPE_HOUR[ritualType], timeZone);
    if (!day || day.getTime() < fromDate.getTime()) continue;
    const moon = getMoonPhase(day);

    if (!moon.favorable.includes(ritualType)) continue;

    let score = 200 - offset;
    if (TYPE_WEEKDAY[ritualType].includes(new Date(`${civilDate}T12:00:00Z`).getUTCDay())) score += 30;

    if (!best || score > best.score) {
      best = { day, score, moon };
    }
  }

  // All ritual types have a favorable phase within one lunar month.
  if (!best) throw new Error("NO_FUTURE_RITUAL_TIME");
  const at = best.day;
  const moon = best.moon;
  const parts = calendarParts(at, timeZone);
  const planet = PLANET_BY_DOW[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  const factors = [
    `${moon.phase} в ${moon.sign}`,
    `${planet}: ${TYPE_PLANET_HINT[ritualType]}`,
  ];

  return {
    at,
    label: formatRitualTimeLabel(at, timeZone),
    moonPhase: moon.phase,
    moonSign: moon.sign,
    factors,
  };
}

export function buildRitualTimeString(
  schedule: RitualSchedule,
  reason?: string | null
): string {
  const base = `${schedule.label} — ${schedule.factors.join("; ")}`;
  const trimmed = reason?.trim();
  if (!trimmed) return base;
  return `${base}. ${trimmed}`;
}

/** Rebuild display time for legacy rows that only have LLM weekday text. */
export function resolveRitualTimeDisplay(
  ritualType: RitualType,
  stored: string | null,
  createdAt: Date
): string | null {
  if (!stored?.trim()) return null;

  const schedule = computeRitualSchedule(ritualType, createdAt);
  const hasRealDate =
    /\d{4}\s*г\.?/i.test(stored) ||
    /\d{1,2}\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(
      stored
    );

  if (hasRealDate && stored.startsWith(schedule.label.split(",")[0])) {
    return stored;
  }

  const reasonPart = stored.includes(" — ")
    ? stored.split(" — ").slice(1).join(" — ").trim()
    : stored.replace(/^[А-Яа-я]+,?\s*\d{1,2}:\d{2}\s*—?\s*/i, "").trim();

  const llmReason =
    reasonPart &&
    !reasonPart.startsWith(schedule.factors[0]) &&
    reasonPart.length > 12
      ? reasonPart
      : null;

  return buildRitualTimeString(schedule, llmReason);
}
