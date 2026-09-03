import { describe, expect, it, vi } from "vitest";
import { resolveFallbackCity } from "@/lib/natal/cities-fallback";
import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
import { computeTransitTimeline, type TimingSkyProvider } from "@/lib/natal/timing";
import type { NatalChartRecord } from "@/lib/natal/types";
import { birthFingerprintsMatch } from "@/lib/natal/types";

describe("launch calculation regressions", () => {
  it("preserves guest and legacy chart identities across SQL zero-second formatting", () => {
    const minute = "1990-01-01|12:30|moscow";
    const second = "1990-01-01|12:30:00|moscow";
    expect(birthFingerprintsMatch(minute, second)).toBe(true);
    expect(birthFingerprintsMatch(second, minute)).toBe(true);
    expect(birthFingerprintsMatch(minute, "1990-01-01|12:30:01|moscow")).toBe(false);
    expect(birthFingerprintsMatch(minute, "1990-01-01|12:30|london")).toBe(false);
    expect(birthFingerprintsMatch(undefined, minute)).toBe(false);
  });
  it("does not replace a city in another country with a curated capital", () => {
    expect(resolveFallbackCity("London, Ontario, Canada")).toBeNull();
    expect(resolveFallbackCity("Moscow, Idaho, United States")).toBeNull();
    expect(resolveFallbackCity("London, England, United Kingdom")?.timezone).toBe("Europe/London");
    expect(resolveFallbackCity("москва")?.timezone).toBe("Europe/Moscow");
  });

  it.each(["1990-05-01", "1990-05-15", "1990-05-31"])("marks an age transition in the birthday month: %s", (birthDate) => {
    const forecast = matrixYearForecast(birthDate, new Date("2025-01-01T12:00:00Z"))!;
    expect(forecast.months.filter((month) => month.ageTransition).map((month) => month.label)).toEqual(["Май 2025"]);
  });

  it.each(["Asia/Kolkata", "Asia/Kathmandu", "America/St_Johns"])("samples local noon without truncating fractional offsets: %s", async (timezone) => {
    const samples: Date[] = [];
    const skyProvider = vi.fn(async (date: Date) => { samples.push(date); return {}; }) as TimingSkyProvider;
    await computeTransitTimeline({
      natal: { western: {}, place: { timezone, latitude: 28, longitude: 77 } } as NatalChartRecord,
      horizon: 7,
      referenceDate: new Date("2026-01-01T12:00:00Z"),
      skyProvider,
    });
    expect(samples.length).toBeGreaterThan(0);
    const format = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    expect(samples.map((sample) => format.format(sample))).toEqual(samples.map(() => "12:00"));
  });
});
