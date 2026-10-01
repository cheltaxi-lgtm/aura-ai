export const NATAL_ENGINE_VERSION = "v4-astronomy-placidus-utc-dasha-1.0";

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
  birthTimeOccurrence?: "earlier" | "later";
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
  profileFingerprint?: string;
  birthTimeOccurrence?: "earlier" | "later";
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
  birthTimeOccurrence?: "earlier" | "later";
  place?: NatalPlace | null;
  timeKnown?: boolean;
}): string {
  const profile = [
    input.birthDate.trim().slice(0, 10),
    (input.birthTime ?? "").trim().replace(/^(\d{2}:\d{2}):00$/, "$1"),
    (input.birthCity ?? "").trim().toLowerCase(),
  ].join("|");
  const inputKey = input.birthTimeOccurrence ? `${profile}|${input.birthTimeOccurrence}` : profile;
  return input.place ? `${inputKey}|${input.timeKnown === true}|${input.place.latitude}|${input.place.longitude}|${input.place.timezone}` : inputKey;
}

export function birthTimeOccurrenceFromProfile(user: { birth_date: string | Date | null; birth_time?: string | null; birth_city?: string | null; astro_meta?: unknown }): "earlier" | "later" | undefined {
  const meta = user.astro_meta as { natalBirthTime?: { profileFingerprint?: string; occurrence?: string } } | null;
  const choice = meta?.natalBirthTime;
  if (!user.birth_date || choice?.profileFingerprint !== buildBirthFingerprint({ birthDate: String(user.birth_date).slice(0, 10), birthTime: user.birth_time, birthCity: user.birth_city })) return undefined;
  return choice.occurrence === "earlier" || choice.occurrence === "later" ? choice.occurrence : undefined;
}

/** Compare SQL TIME (HH:MM:00) with browser HH:MM without rewriting stored report keys. */
export function birthFingerprintsMatch(stored: string | undefined, current: string): boolean {
  if (!stored) return false;
  const normalize = (value: string) => {
    const parts = value.split("|");
    if (parts.length < 3) return value;
    parts[1] = parts[1].replace(/^([0-2]\d:[0-5]\d):00$/, "$1");
    return parts.join("|");
  };
  return normalize(stored) === normalize(current);
}

/** A selected place remains authoritative while its profile inputs are unchanged. */
export function natalPlaceFromProfile(user: { birth_date: string | Date | null; birth_time?: string | null; birth_city?: string | null; astro_meta?: unknown }): NatalPlace | undefined {
  const meta = user.astro_meta as { natalBirthPlace?: { profileFingerprint?: string; place?: NatalPlace } } | null;
  const saved = meta?.natalBirthPlace;
  if (!user.birth_date || !saved?.place || !birthFingerprintsMatch(saved.profileFingerprint, buildBirthFingerprint({ birthDate: String(user.birth_date).slice(0, 10), birthTime: user.birth_time, birthCity: user.birth_city }))) return undefined;
  return saved.place;
}
