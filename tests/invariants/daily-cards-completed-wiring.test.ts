import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("daily_cards_completed wiring", () => {
  it("TEST16/17/18: fires only after successful /api/onboarding in handleTripletComplete", () => {
    const src = readFileSync(resolve("src/hooks/useOnboardingFlow.ts"), "utf8");
    expect(src).toMatch(/trackDailyCardsCompleted\("handle_triplet_complete"\)/);
    // Guarded by res.ok and exactly-once ref.
    expect(src).toMatch(/if \(res\.ok\)[\s\S]*?trackDailyCardsCompleted/);
    expect(src).toMatch(/dailyCompletedTrackedRef/);
    // Guest resume path must not call completed helper.
    const guestBlock = src.slice(
      src.indexOf("spreadType: \"guest_resume\""),
      src.indexOf("spreadType: \"guest_resume\"") + 2500
    );
    expect(guestBlock).not.toMatch(/trackDailyCardsCompleted/);
  });
});
