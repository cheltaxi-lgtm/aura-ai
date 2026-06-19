import { effectiveTripletCooldown, type TripletCooldownStatus } from "@/lib/triplet-limit";

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

export function mergeTripletCooldownWithAnchors(
  server: TripletCooldownStatus | null | undefined,
  profileAnchor?: string | null
): TripletCooldownStatus {
  return effectiveTripletCooldown(
    server?.lastTripletAt,
    profileAnchor,
    readLocalTripletDrawAt()
  );
}
