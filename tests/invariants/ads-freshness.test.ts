import { describe, expect, it } from "vitest";
import { statsFreshnessHours } from "@/modules/ads/guard/freshness";

describe("ads stats freshness", () => {
  const nowMs = Date.parse("2026-09-20T15:10:00Z");

  it("uses the successful sync time when a zero-row report leaves old data", () => {
    expect(
      statsFreshnessHours({
        lastSuccessfulSyncAt: "2026-09-20T12:05:00Z",
        latestDataDate: "2026-09-17",
        nowMs,
      })
    ).toBeCloseTo(3 + 5 / 60);
  });

  it("falls back to the latest data date before the first recorded sync", () => {
    expect(
      statsFreshnessHours({
        lastSuccessfulSyncAt: null,
        latestDataDate: "2026-09-19",
        nowMs,
      })
    ).toBeCloseTo(15 + 10 / 60 + 1 / 3600);
  });

  it("returns null when neither freshness signal is valid", () => {
    expect(
      statsFreshnessHours({
        lastSuccessfulSyncAt: "invalid",
        latestDataDate: null,
        nowMs,
      })
    ).toBeNull();
  });
});
