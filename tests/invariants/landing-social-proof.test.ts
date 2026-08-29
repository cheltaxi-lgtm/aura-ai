/**
 * Guest landing social-proof counters stay modest, deterministic, and
 * timezone-safe (Moscow calendar, not UTC-offset math).
 */
import { describe, expect, it } from "vitest";
import {
  applyLandingSocialProofLiveOffsets,
  getLandingSocialProofStats,
  landingSocialProofLiveIntervalRange,
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

  it("online wanders by 1 over a sitting, not every few seconds", () => {
    const start = new Date("2026-08-29T19:00:00+03:00");
    const values = new Set<number>();
    for (let sec = 0; sec <= 12 * 60; sec += 20) {
      values.add(parseValue(byKey(new Date(start.getTime() + sec * 1000)).online.value));
    }
    expect(values.size).toBeGreaterThan(1);
    const list = [...values].sort((a, b) => a - b);
    expect(list[list.length - 1] - list[0]).toBeLessThanOrEqual(4);
  });

  it("live totals tick sparsely so a glance does not look scripted", () => {
    const peak = landingSocialProofLiveIntervalRange("total", new Date("2026-08-29T20:00:00+03:00"));
    const users = landingSocialProofLiveIntervalRange("users", new Date("2026-08-29T20:00:00+03:00"));
    const night = landingSocialProofLiveIntervalRange("total", new Date("2026-08-29T03:00:00+03:00"));
    expect(peak.min).toBeGreaterThanOrEqual(45_000);
    expect(peak.max).toBeGreaterThan(peak.min);
    expect(users.min).toBeGreaterThan(peak.min);
    expect(night.min).toBeGreaterThan(peak.max);
  });

  it("session offsets only add, never jump by tens", () => {
    const base = getLandingSocialProofStats(afternoon);
    const bumped = applyLandingSocialProofLiveOffsets(base, { users: 1, total: 2 });
    expect(parseValue(bumped.find((s) => s.key === "total")!.value)).toBe(
      parseValue(base.find((s) => s.key === "total")!.value) + 2
    );
    expect(parseValue(bumped.find((s) => s.key === "users")!.value)).toBe(
      parseValue(base.find((s) => s.key === "users")!.value) + 1
    );
    expect(bumped.find((s) => s.key === "online")!.value).toBe(base.find((s) => s.key === "online")!.value);
  });
});
