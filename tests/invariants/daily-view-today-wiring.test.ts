import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("daily view-today wiring", () => {
  it("TEST4: HomePage view-today uses openCurrentDailyCards, not #мой-расклад scroll alone", () => {
    const src = readFileSync(resolve("src/components/HomePage.tsx"), "utf8");
    expect(src).toMatch(/onViewTodayDailyCards=\{\(\) => void openCurrentDailyCards\(\)\}/);
    // Must not bind view-today to generic home recap scroll.
    expect(src).not.toMatch(
      /onViewTodayDailyCards=\{\(\)\s*=>\s*\{?\s*document\.getElementById\(["']мой-расклад["']\)/
    );
  });

  it("useOnboardingFlow exposes openCurrentDailyCards that restores daily session", () => {
    const src = readFileSync(resolve("src/hooks/useOnboardingFlow.ts"), "utf8");
    expect(src).toMatch(/const openCurrentDailyCards = useCallback/);
    expect(src).toMatch(/restoreChatForCharacter/);
    expect(src).toMatch(/spreadType:\s*"daily"/);
  });
});
