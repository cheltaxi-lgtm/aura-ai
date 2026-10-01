import { computeNatalChartRecord } from "@/lib/natal/compute";
import { computePersonalTiming } from "@/lib/natal/timing";
import { natalForecastWindowIsCurrent } from "@/lib/natal/presentation";
import { describe, expect, it } from "vitest";
import { calculateVedic } from "natalengine";
import { computeNatalSkyAtUtc } from "@/lib/natal/astronomy-sky";
import { canonicalVedicEnginePayload } from "@/lib/natal/vedic-precision";
import { normalizeVedicChart } from "@/lib/natal/vedic";
import { birthTimeLabel, resolveBirthUtcOffsetHours } from "@/lib/natal/time";
import { buildBirthFingerprint } from "@/lib/natal/types";
import { computeTransitTimeline } from "@/lib/natal/timing";
import { detectPatterns } from "@/lib/natal/patterns";

describe("Natal independent calculation regression", () => {
  // NASA JPL Horizons, Q31, geocentric apparent ecliptic/equinox of date.
  // Historical results before 1962 are UT1; tolerate one arcminute, not a degree.
  const anchors = [
    ["mercury", "1960-07-15T18:30:00Z", 115.2663298],
    ["pluto", "1900-01-15T18:30:00Z", 75.0174838],
    ["moon", "1990-06-15T18:30:59Z", 348.9992466],
    ["pluto", "1932-07-01T05:00:00Z", 111.3529],
    ["mercury", "1955-02-10T03:00:00Z", 326.2516],
    ["pluto", "1999-12-31T14:05:00Z", 251.4225],
  ] as const;
  it.each(anchors)("matches JPL %s at %s", (body, utc, longitude) => {
    const actual = computeNatalSkyAtUtc(new Date(utc))[body].longitude;
    const error = Math.abs((actual - longitude + 540) % 360 - 180);
    expect(error * 60).toBeLessThan(1);
  });
  it("rejects gaps and requires a choice for repeated local times", () => {
    expect(() => resolveBirthUtcOffsetHours("2024-03-10", "02:30", "America/New_York")).toThrow("NONEXISTENT_BIRTH_TIME");
    expect(() => resolveBirthUtcOffsetHours("2011-12-30", "12:00", "Pacific/Apia")).toThrow("NONEXISTENT_BIRTH_TIME");
    expect(() => resolveBirthUtcOffsetHours("2024-10-06", "02:15", "Australia/Lord_Howe")).toThrow("NONEXISTENT_BIRTH_TIME");
    expect(() => resolveBirthUtcOffsetHours("2024-11-03", "01:30", "America/New_York")).toThrow("AMBIGUOUS_BIRTH_TIME");
    expect(resolveBirthUtcOffsetHours("2024-11-03", "01:30", "America/New_York", "earlier")).toBe(-4);
    expect(resolveBirthUtcOffsetHours("2024-11-03", "01:30", "America/New_York", "later")).toBe(-5);
    expect(birthTimeLabel(14 + 29 / 60)).toBe("14:29");
    expect(birthTimeLabel(14 + 30 / 60 + 59 / 3600)).toBe("14:30:59");
  });
  it("preserves seconds, UTC, fraction and current period on snapshot reads", () => {
    const raw = calculateVedic("1990-06-15", 14.5 + 59 / 3600, -4, 40.7128, -74.006);
    const chart = normalizeVedicChart(canonicalVedicEnginePayload(raw), { timeKnown: true, hasLocation: true, currentDate: new Date("2026-10-01T00:00:00Z") })!;
    expect(chart.positions.moon!.tropicalLongitude).toBeCloseTo(348.9995012923, 7);
    expect(Date.parse(chart.dasha.dashas[0].startDate)).toBeCloseTo(Date.parse("1990-06-15T18:30:59Z"), -1);
    const period = chart.dasha.dashas[0];
    expect(Math.abs(Date.parse(period.endDate) - Date.parse(period.startDate) - period.years * 365.2425 * 86400000)).toBeLessThan(2);
    const read = (date: string) => normalizeVedicChart(JSON.parse(JSON.stringify(chart)), { timeKnown: true, hasLocation: true, source: "snapshot", currentDate: new Date(date) })!;
    expect(read("2026-10-01").dasha.proportionElapsed).toBe(chart.dasha.proportionElapsed);
    expect(read("2026-10-01").dasha.authoritative).toBe(true);
    expect(read("1991-01-01").dasha.current!.lord).toBe("Jupiter");
    expect(read("2200-01-01").dasha.current).toBeNull();
  });
  it("calculation identity includes resolved location and fold choice", () => {
    const profile = { birthDate: "1990-06-15", birthTime: "14:30", birthCity: "same label", timeKnown: true };
    const place = { label: "same label", latitude: 55, longitude: 37, timezone: "Europe/Moscow" };
    expect(buildBirthFingerprint({ ...profile, place })).not.toBe(buildBirthFingerprint({ ...profile, place: { ...place, longitude: 38 } }));
    expect(buildBirthFingerprint({ ...profile, place, birthTimeOccurrence: "earlier" })).not.toBe(buildBirthFingerprint({ ...profile, place, birthTimeOccurrence: "later" }));
    expect(buildBirthFingerprint({ ...profile, place, birthTime: "14:30:00" })).toBe(buildBirthFingerprint({ ...profile, place }));
  });
  it("handles a skipped calendar day in transit sampling", async () => {
    const events = await computeTransitTimeline({ natal: { userId: "fixture", timeKnown: true, place: { label: "Apia", latitude: -13.8, longitude: -171.75, timezone: "Pacific/Apia" }, western: { sun: { longitude: 0 } }, vedic: null, computedAt: null, warnings: [], engineVersion: "fixture" }, horizon: 7, referenceDate: new Date("2011-12-29T00:00:00Z"), skyProvider: () => ({ sun: { longitude: 90, retrograde: false } }) });
    expect(events.every(event => event.date !== "2011-12-30" && event.windowStart !== "2011-12-30" && event.windowEnd !== "2011-12-30")).toBe(true);
    expect(events.every(event => event.source === "astronomy-transit")).toBe(true);
  });
  it("T-square detection does not depend on aspect order or pair direction", () => {
    const aspects = [ { planet1: "sun", planet2: "moon", aspect: "opposition", orb: 0, nature: "major" }, { planet1: "sun", planet2: "mars", aspect: "square", orb: 0, nature: "major" }, { planet1: "moon", planet2: "mars", aspect: "square", orb: 0, nature: "major" } ];
    const expected = detectPatterns(aspects);
    expect(expected.some(pattern => pattern.label === "T-квадрат")).toBe(true);
    expect(detectPatterns([...aspects].reverse().map(aspect => ({ ...aspect, planet1: aspect.planet2, planet2: aspect.planet1 })))).toEqual(expected);
  });
});

describe("Natal archive calendar windows", () => {
  it("uses the chart timezone on both forecast boundaries", () => {
    expect(natalForecastWindowIsCurrent("forecast:7:2026-10-01", "Europe/Moscow", new Date("2026-09-30T21:30:00Z"))).toBe(true);
    expect(natalForecastWindowIsCurrent("forecast:7:2026-10-01", "Europe/Moscow", new Date("2026-10-07T20:59:59Z"))).toBe(true);
    expect(natalForecastWindowIsCurrent("forecast:7:2026-10-01", "Europe/Moscow", new Date("2026-10-07T21:00:00Z"))).toBe(false);
    expect(natalForecastWindowIsCurrent("forecast:7:2026-02-30", "Europe/Moscow")).toBe(false);
    expect(natalForecastWindowIsCurrent("forecast:7:2026-10-01", "Invalid/Zone")).toBe(false);
  });
});

describe("Natal forecast skipped-day outer range", () => {
  it("ends at the last existing local day before an exclusive boundary", async () => {
    const natal = await computeNatalChartRecord("fixture", { birthDate: "1980-01-15", birthTime: "12:00", timeKnown: true, birthCity: "Apia", place: { label: "Apia", latitude: -13.8, longitude: -171.75, timezone: "Pacific/Apia" } });
    const result = await computePersonalTiming({ natal, birthDate: "1980-01-15", birthTime: "12:00", horizon: 7, referenceDate: new Date("2011-12-24T22:00:00Z") });
    expect(result.windowStart).toBe("2011-12-24"); expect(result.windowEnd).toBe("2011-12-29");
  });
});
