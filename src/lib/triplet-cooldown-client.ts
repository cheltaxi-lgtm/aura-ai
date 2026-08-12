import { type TripletCooldownStatus } from "@/lib/triplet-limit";

const LOCAL_TRIPLET_AT_KEY = "aura_last_triplet_at";

export function readLocalTripletDrawAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_TRIPLET_AT_KEY);
    return raw?.trim() ? raw : null;
  } catch {
    return null;
  }
}

export function writeLocalTripletDrawAt(at: Date | string = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    const iso = at instanceof Date ? at.toISOString() : at;
    localStorage.setItem(LOCAL_TRIPLET_AT_KEY, iso);
  } catch {
    /* ignore quota */
  }
}

export function clearLocalTripletDrawAt(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOCAL_TRIPLET_AT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Daily entitlement is server-authoritative.
 * Legacy profile/local lastTripletDrawAt may be polluted by ordinary triplets —
 * never let those override server.allowed.
 */
export function mergeTripletCooldownWithAnchors(
  server: TripletCooldownStatus | null | undefined,
  _profileAnchor?: string | null
): TripletCooldownStatus {
  if (server) return server;
  // Before first profile sync: do not invent a daily cooldown from polluted local anchors.
  return { allowed: true, nextAvailableAt: null, lastTripletAt: null };
}
