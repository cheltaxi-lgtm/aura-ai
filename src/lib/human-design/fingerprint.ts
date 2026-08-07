import { createHash } from "crypto";
import type { HdCalcInput } from "./types";

export interface HdChartIdentity extends HdCalcInput {
  placeName: string;
  lat: number;
  lon: number;
}

function roundCoord(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** "7:30" → "07:30" — the same moment must not fragment into two charts. */
function normalizeBirthTime(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "unknown";
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return trimmed; // invalid input is rejected upstream anyway
  return `${match[1]!.padStart(2, "0")}:${match[2]}`;
}

/**
 * "europe/moscow" → "Europe/Moscow" — Intl tz resolution is case-insensitive,
 * so a raw hash of the input would split one chart into two fingerprints
 * (two guest-pool rows, two paid reports for the same person).
 * resolvedOptions() returns the canonical IANA casing; already-canonical
 * inputs pass through unchanged, so existing fingerprints stay valid.
 */
/** Canonical IANA casing via Intl (Europe/Kiev → Europe/Kyiv when the host resolves it). */
export function normalizeHdTimezone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).resolvedOptions()
        .timeZone ?? trimmed
    );
  } catch {
    return trimmed; // invalid tz is rejected upstream by the engine
  }
}

/**
 * Stable identity of a chart request. Doubles as a bearer capability for
 * guest charts: the chart is a deterministic function of this input, so
 * knowing the fingerprint grants nothing beyond re-deriving public data.
 */
export function hdFingerprint(identity: HdChartIdentity): string {
  const canonical = [
    identity.birthDate,
    normalizeBirthTime(identity.birthTime),
    normalizeHdTimezone(identity.timezone),
    identity.placeName.trim().replace(/\s+/g, " ").toLowerCase(),
    roundCoord(identity.lat).toFixed(4),
    roundCoord(identity.lon).toFixed(4),
  ].join("|");
  return createHash("sha256").update(`hd:v1:${canonical}`).digest("hex");
}
