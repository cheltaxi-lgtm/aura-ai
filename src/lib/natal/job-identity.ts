import type { NatalChartRecord } from "./types";

export function natalChartJobIdentity(chart: NatalChartRecord) {
  return { birthFingerprint: chart.birthFingerprint ?? "", engineVersion: chart.engineVersion,
    ephemeris: typeof chart.western?.ephemeris === "string" ? chart.western.ephemeris : "unknown" };
}

export function natalQueuedChartMatches(expected: unknown, chart: NatalChartRecord): boolean {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) return false;
  const value = expected as Record<string, unknown>;
  const current = natalChartJobIdentity(chart);
  return Boolean(current.birthFingerprint) && value.birthFingerprint === current.birthFingerprint &&
    value.engineVersion === current.engineVersion && value.ephemeris === current.ephemeris;
}
