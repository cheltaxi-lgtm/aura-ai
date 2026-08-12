/**
 * Privacy-safe auth retention windows (D1 / D7 / later).
 * Anchor = server account createdAt; calendar math in product IANA timezone.
 */

import { localDateStringInTimezone } from "@/lib/natal/time";

/** Product calendar for retention cohorts (matches daily-reminder Moscow day). */
export const AUTH_RETENTION_TIMEZONE = "Europe/Moscow";

export type AuthRetentionState = "d1" | "d7" | "later";

/** Whole calendar days between two YYYY-MM-DD labels (dateB − dateA). */
export function calendarDaysBetween(dateA: string, dateB: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateA) || !/^\d{4}-\d{2}-\d{2}$/.test(dateB)) {
    return null;
  }
  const [y1, m1, d1] = dateA.split("-").map(Number);
  const [y2, m2, d2] = dateB.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1, 12);
  const b = Date.UTC(y2, m2 - 1, d2, 12);
  const diff = Math.round((b - a) / 86_400_000);
  return Number.isFinite(diff) ? diff : null;
}

/**
 * Resolve retention_return state from server-authoritative createdAt.
 * Registration day (delta 0) → null. Days 2–6 → null (not a measured bucket).
 */
export function resolveAuthRetentionState(input: {
  createdAt: string | Date | null | undefined;
  now?: Date;
  timezone?: string;
}): AuthRetentionState | null {
  if (input.createdAt == null || input.createdAt === "") return null;
  const created =
    typeof input.createdAt === "string" || input.createdAt instanceof Date
      ? new Date(input.createdAt)
      : null;
  if (!created || !Number.isFinite(created.getTime())) return null;

  const tz = input.timezone?.trim() || AUTH_RETENTION_TIMEZONE;
  const now = input.now ?? new Date();
  const createdDay = localDateStringInTimezone(tz, created);
  const today = localDateStringInTimezone(tz, now);
  const delta = calendarDaysBetween(createdDay, today);
  if (delta == null || delta <= 0) return null;
  if (delta === 1) return "d1";
  if (delta === 7) return "d7";
  if (delta > 7) return "later";
  return null;
}
