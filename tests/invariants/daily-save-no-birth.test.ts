import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("daily save path avoids birth onboarding", () => {
  it("TEST2: /api/tarot/daily route exists and documents no birth requirement", () => {
    const src = readFileSync(resolve("src/app/api/tarot/daily/route.ts"), "utf8");
    expect(src).toMatch(/saveAuthenticatedDailyTriplet/);
    expect(src).toMatch(/Does NOT require birthDate/);
    expect(src).not.toMatch(/MISSING_PROFILE/);
    expect(src).not.toMatch(/!birthDate|!zodiac/);
  });

  it("handleTripletComplete posts to /api/tarot/daily, not /api/onboarding", () => {
    const src = readFileSync(resolve("src/hooks/useOnboardingFlow.ts"), "utf8");
    const start = src.indexOf("const handleTripletComplete");
    const end = src.indexOf("const handleTripletBack");
    const block = src.slice(start, end);
    expect(block).toMatch(/\/api\/tarot\/daily/);
    expect(block).not.toMatch(/fetch\("\/api\/onboarding"/);
    expect(block).toMatch(/Daily Tarot must never force birth onboarding/);
  });
});
