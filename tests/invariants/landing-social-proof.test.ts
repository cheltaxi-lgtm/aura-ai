/**
 * Guest landing social-proof counters stay modest, deterministic, and
 * timezone-safe (Moscow calendar, not UTC-offset math).
 */
import { describe, expect, it } from "vitest";
import {
  getLandingSocialProofStats,
  mergeLandingSocialProofWithPublicStats,
} from "@/lib/landing-social-proof";

function byKey(now: Date) {
  const stats = getLandingSocialProofStats(now);
  return Object.fromEntries(stats.map((s) => [s.key, s]));
}

function parseValue(value: string): number {
  return Number.parseInt(value.replace(/\s/g, ""), 10);
}

describe("landing social proof", () => {
  const afternoon = new Date("2026-08-29T16:00:00+03:00");

  it("exposes registered, spreads, and live online counters", () => {
    const stats = getLandingSocialProofStats(afternoon);
    expect(stats.map((s) => s.key)).toEqual(["users", "total", "online"]);
    const map = byKey(afternoon);
    expect(map.users.label).toBe("зарегистрированы");
    expect(map.total.label).toBe("раскладов");
    expect(map.online.label).toBe("сейчас на сайте");
    expect(map.online.live).toBe(true);
  });

  it("stays in a young-site range for the current season", () => {
    const map = byKey(afternoon);
    const users = parseValue(map.users.value);
    const total = parseValue(map.total.value);
    const online = parseValue(map.online.value);
    expect(users).toBeGreaterThan(100);
    expect(users).toBeLessThan(8_000);
    expect(total).toBeGreaterThan(users);
    expect(total).toBeLessThan(12_000);
    expect(online).toBeGreaterThanOrEqual(1);
    expect(online).toBeLessThanOrEqual(12);
  });

  it("is deterministic for the same Moscow instant", () => {
    expect(getLandingSocialProofStats(afternoon)).toEqual(getLandingSocialProofStats(afternoon));
  });

  it("grows through the day and overnight stays quiet", () => {
    const morning = byKey(new Date("2026-08-29T08:00:00+03:00"));
    const evening = byKey(new Date("2026-08-29T21:00:00+03:00"));
    const night = byKey(new Date("2026-08-29T03:00:00+03:00"));
    expect(parseValue(evening.total.value)).toBeGreaterThan(parseValue(morning.total.value));
    expect(parseValue(night.online.value)).toBeLessThanOrEqual(parseValue(evening.online.value));
  });

  it("uses real public stats only as a soft floor, never a 2x explosion", () => {
    const synthetic = getLandingSocialProofStats(afternoon);
    const blended = mergeLandingSocialProofWithPublicStats(synthetic, 50_000, 40_000);
    expect(blended).toEqual(synthetic);
    const modest = mergeLandingSocialProofWithPublicStats(synthetic, 10, 10);
    expect(parseValue(modest.find((s) => s.key === "total")!.value)).toBeGreaterThanOrEqual(
      parseValue(synthetic.find((s) => s.key === "total")!.value)
    );
  });
});
