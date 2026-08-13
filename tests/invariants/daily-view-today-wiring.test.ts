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

  it("useOnboardingFlow openCurrentDailyCards shows daily triplet, not guest/chat restore", () => {
    const src = readFileSync(resolve("src/hooks/useOnboardingFlow.ts"), "utf8");
    const start = src.indexOf("const openCurrentDailyCards = useCallback");
    const end = src.indexOf("const handleNewReading", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const fn = src.slice(start, end);
    expect(fn).toMatch(/setViewingOpenedDaily\(true\)/);
    expect(fn).toMatch(/setStep\("triplet"\)/);
    expect(fn).toMatch(/spreadType:\s*"daily"/);
    expect(fn).not.toMatch(/restoreChatForCharacter/);
    expect(fn).not.toMatch(/beginChatAfterIntention/);
    expect(fn).not.toMatch(/setShowSessionFlow\(true\)/);
    expect(fn).not.toMatch(/GUEST_SPREAD_START/);
    expect(fn).not.toMatch(/startGuestSpread\(/);
    expect(fn).not.toMatch(/setSeoFlowOpen/);
    expect(fn).not.toMatch(/MagicalSpreadTable/);
    expect(src).toMatch(/if \(newTripletDraft \|\| newTripletInProgressRef\.current \|\| viewingOpenedDaily\) return/);
  });

  it("chat history does not steal latest-active session when a specific session is requested", () => {
    const src = readFileSync(resolve("src/app/api/chat/history/route.ts"), "utf8");
    expect(src).toMatch(/if \(!sessionRow && requestedSessionId\)/);
    expect(src).toMatch(
      /if \(!sessionRow && !archiveSessionId && !requestedSessionId\)/
    );
  });
});
