import { addCalendarDays, productCalendarDate, zonedStartOfDay } from "@/lib/product-calendar";

export interface TripletCooldownStatus {
  allowed: boolean;
  nextAvailableAt: string | null;
  lastTripletAt: string | null;
}

/**
 * Daily 3-cards entitlement: one draw per Europe/Moscow calendar day.
 * Resets at 00:00 Moscow, not a rolling 24h window.
 *
 * Callers: loadDailyTripletCooldown, tripletCooldownFromProfileData,
 * useOnboardingFlow (optimistic save + 429), effectiveTripletCooldown, tests.
 */
export function tripletCooldownFromLastDraw(
  lastCreatedAt: Date | string | null | undefined,
  now: Date = new Date()
): TripletCooldownStatus {
  if (!lastCreatedAt) {
    return { allowed: true, nextAvailableAt: null, lastTripletAt: null };
  }

  const last = lastCreatedAt instanceof Date ? lastCreatedAt : new Date(lastCreatedAt);
  if (!Number.isFinite(last.getTime())) {
    return { allowed: true, nextAvailableAt: null, lastTripletAt: null };
  }

  const lastIso = last.toISOString();
  const lastDay = productCalendarDate(last);
  const next = zonedStartOfDay(addCalendarDays(lastDay, 1));

  if (now.getTime() >= next.getTime()) {
    return { allowed: true, nextAvailableAt: null, lastTripletAt: lastIso };
  }

  return {
    allowed: false,
    nextAvailableAt: next.toISOString(),
    lastTripletAt: lastIso,
  };
}

export function formatTripletCooldownRu(nextAvailableAt: string): string {
  const ms = new Date(nextAvailableAt).getTime() - Date.now();
  if (ms <= 0) return "скоро";

  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `через ${hours} ч ${minutes} мин`;
  if (hours > 0) return `через ${hours} ч`;
  return `через ${minutes} мин`;
}

/** Live countdown for tooltips: HH:MM:SS */
export function formatCountdownHMS(msRemaining: number): string {
  if (msRemaining <= 0) return "00:00:00";
  const totalSec = Math.ceil(msRemaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Pick the latest draw time and apply the Moscow calendar-day rule (server + local anchors). */
export function effectiveTripletCooldown(
  ...anchors: (Date | string | null | undefined)[]
): TripletCooldownStatus {
  let latest: string | null = null;
  for (const anchor of anchors) {
    if (!anchor) continue;
    const iso = anchor instanceof Date ? anchor.toISOString() : String(anchor);
    if (!latest || new Date(iso).getTime() > new Date(latest).getTime()) {
      latest = iso;
    }
  }
  return tripletCooldownFromLastDraw(latest);
}
