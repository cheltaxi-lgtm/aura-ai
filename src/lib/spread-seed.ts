import { createHash } from "crypto";

export interface SpreadSeedParts {
  userId?: string | null;
  guestId?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  masterId: string;
  topic?: string | null;
  customQuestion?: string | null;
  spreadId?: string | null;
  numerologTool?: string | null;
  partnerDate?: string | null;
  reshuffleSalt?: string | null;
  localDate?: string | null;
}

/** Stable fingerprint — same inputs → same spread order. */
export function buildSpreadSeed(parts: SpreadSeedParts): string {
  const payload = [
    parts.userId ?? "",
    parts.guestId ?? "",
    parts.birthDate ?? "",
    parts.gender ?? "",
    parts.masterId,
    parts.topic ?? "",
    parts.customQuestion ?? "",
    parts.spreadId ?? "",
    parts.numerologTool ?? "",
    parts.partnerDate ?? "",
    parts.reshuffleSalt ?? "",
    parts.localDate ?? "",
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

/** FNV-1a — works in browser bundles without node:crypto. */
export function hashStringToUint32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type SpreadRng = () => number;

/** Mulberry32 PRNG — deterministic from seed string. */
export function createSeededRng(seed: string): SpreadRng {
  let state = hashStringToUint32(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Browser-safe seed (no node crypto). */
export function buildGuestSpreadSeed(parts: Omit<SpreadSeedParts, "userId">): string {
  const payload = [
    parts.guestId ?? "",
    parts.birthDate ?? "",
    parts.masterId,
    parts.topic ?? "",
    parts.customQuestion ?? "",
    parts.spreadId ?? "",
    parts.reshuffleSalt ?? "",
    parts.localDate ?? "",
  ].join("|");
  let h = hashStringToUint32(payload);
  for (let round = 0; round < 4; round++) {
    h = hashStringToUint32(`${h}:${round}:${payload}`);
  }
  return h.toString(16).padStart(8, "0").repeat(4).slice(0, 32);
}
