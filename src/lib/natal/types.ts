export const NATAL_ENGINE_VERSION = "v3-celestine-placidus-1.0";

import type { TransitHit } from "./transits";

export type NatalTradition = "western" | "vedic";

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
}

export interface NatalChartRecord {
  userId: string;
  timeKnown: boolean;
  place: NatalPlace | null;
  western: Record<string, unknown> | null;
  vedic: Record<string, unknown> | null;
  transits?: TransitHit[];
  transitCacheDate?: string;
  birthFingerprint?: string;
  interpretation?: string;
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
