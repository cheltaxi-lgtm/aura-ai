export const TRIPLET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface TripletCooldownStatus {
  allowed: boolean;
  nextAvailableAt: string | null;
  lastTripletAt: string | null;
}

export function tripletCooldownFromLastDraw(
  lastCreatedAt: Date | string | null | undefined
): TripletCooldownStatus {
  if (!lastCreatedAt) {
    return { allowed: true, nextAvailableAt: null, lastTripletAt: null };
  }

  const last =
    lastCreatedAt instanceof Date ? lastCreatedAt : new Date(lastCreatedAt);
  const lastIso = last.toISOString();
  const next = new Date(last.getTime() + TRIPLET_COOLDOWN_MS);

  if (Date.now() >= next.getTime()) {
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
