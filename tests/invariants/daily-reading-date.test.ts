import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { productCalendarDate, resolveDailyReadingRequestDate } from "@/lib/product-calendar";

describe("daily reading date entitlement", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  const today = productCalendarDate(now);

  it("ignores yesterday and tomorrow supplied by a signed-in client", () => {
    expect(resolveDailyReadingRequestDate("2026-09-21", false, now)).toBe(today);
    expect(resolveDailyReadingRequestDate("2026-09-23", false, now)).toBe(today);
  });

  it("uses the Moscow date on the UTC/Moscow midnight boundary", () => {
    const boundary = new Date("2026-09-21T22:30:00Z");
    expect(productCalendarDate(boundary)).toBe("2026-09-22");
    expect(resolveDailyReadingRequestDate("2026-09-21", false, boundary)).toBe("2026-09-22");
  });

  it("preserves a queued job's date only for the trusted worker", () => {
    expect(resolveDailyReadingRequestDate("2026-09-21", true, now)).toBe("2026-09-21");
    expect(resolveDailyReadingRequestDate("invalid", true, now)).toBe(today);
  });

  it("the API uses the server date and retires the separate single-card generator", () => {
    const dailyRoute = readFileSync(resolve("src/app/api/daily-reading/route.ts"), "utf8");
    const oldCardRoute = readFileSync(resolve("src/app/api/daily-card/route.ts"), "utf8");
    const dailyEngine = readFileSync(resolve("src/lib/daily-energy.ts"), "utf8");
    expect(dailyRoute).toContain("resolveDailyReadingRequestDate(body.localDate, Boolean(workerUserId))");
    expect(oldCardRoute).toContain('status: 410');
    expect(oldCardRoute).not.toContain("completeChat");
    expect(dailyEngine).toContain("return productCalendarDate()");
  });
});
