export const NATAL_ENGINE_VERSION = "v3-celestine-placidus-1.1";

import type { TransitHit } from "./transits";
import type { VedicChart } from "./vedic";

export type NatalTradition = "western" | "vedic";

export interface NatalInterpretationClaim {
  token: string;
  claimedAtEpoch: number;
}

export interface NatalPlace {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface NatalChartInput {
  birthDate: string;
  birthTime?: string | null;
  birthCity?: string | null;
  timeKnown: boolean;
  /** Pre-resolved place (guest autocomplete / claim adopt). Skips geocode when set. */
  place?: NatalPlace | null;
}

export interface NatalChartRecord {
  userId: string;
  timeKnown: boolean;
  place: NatalPlace | null;
  western: Record<string, unknown> | null;
  vedic: VedicChart | null;
  transits?: TransitHit[];
  transitCacheDate?: string;
  birthFingerprint?: string;
  interpretation?: string;
  interpretations?: Partial<Record<NatalTradition, string>>;
  interpretationClaims?: Record<string, NatalInterpretationClaim>;
  computedAt: string | null;
  engineVersion: string;
  warnings: string[];
}

export function buildBirthFingerprint(input: {
  birthDate: string;
  birthTime?: string | null;
  birthCity?: string | null;
}): string {
  return [
    input.birthDate.trim().slice(0, 10),
    (input.birthTime ?? "").trim(),
    (input.birthCity ?? "").trim().toLowerCase(),
  ].join("|");
}

/** Compare SQL TIME (HH:MM:00) with browser HH:MM without rewriting stored report keys. */
export function birthFingerprintsMatch(stored: string | undefined, current: string): boolean {
  if (!stored) return false;
  const normalize = (value: string) => {
    const parts = value.split("|");
    if (parts.length !== 3) return value;
    parts[1] = parts[1].replace(/^([0-2]\d:[0-5]\d):00$/, "$1");
    return parts.join("|");
  };
  return normalize(stored) === normalize(current);
}
