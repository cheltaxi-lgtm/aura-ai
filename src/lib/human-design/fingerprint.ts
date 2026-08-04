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

/**
 * Stable identity of a chart request. Doubles as a bearer capability for
 * guest charts: the chart is a deterministic function of this input, so
 * knowing the fingerprint grants nothing beyond re-deriving public data.
 */
export function hdFingerprint(identity: HdChartIdentity): string {
  const canonical = [
    identity.birthDate,
    identity.birthTime ?? "unknown",
    identity.timezone,
    identity.placeName.trim().toLowerCase(),
    roundCoord(identity.lat).toFixed(4),
    roundCoord(identity.lon).toFixed(4),
  ].join("|");
  return createHash("sha256").update(`hd:v1:${canonical}`).digest("hex");
}
