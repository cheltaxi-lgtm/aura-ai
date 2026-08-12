import { describe, expect, it } from "vitest";
import {
  resolveDailyCardsUiState,
  shouldEmitDailyCardsStarted,
} from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS } from "@/lib/editorial-landing-content";
import { isHomeRecapHidden, buildHomeRecapKey } from "@/lib/home-recap-key";

describe("daily cards UI state + analytics gating", () => {
  it("TEST4: cooldown not ready → loading (not available/opened)", () => {
    expect(
      resolveDailyCardsUiState({
        cooldownReady: false,
        allowed: false,
        currentDaily: { exists: true } as never,
      })
    ).toBe("loading");
  });

  it("TEST5: ready + allowed → available (even if stale daily object)", () => {
    expect(
      resolveDailyCardsUiState({
        cooldownReady: true,
        allowed: true,
        currentDaily: { exists: true } as never,
      })
    ).toBe("available");
  });

  it("TEST6: cooldown denied + daily artifact → opened", () => {
    expect(
      resolveDailyCardsUiState({
        cooldownReady: true,
        allowed: false,
        currentDaily: {
          exists: true,
          historyId: "h1",
          sessionId: "s1",
          masterId: "veronika",
          cardNames: ["A", "B", "C"],
          cardsKey: "abc",
          createdAt: new Date().toISOString(),
          recapKey: "daily:h:h1",
        },
      })
    ).toBe("opened");
  });

  it("cooldown denied + no artifact → cooldown (not opened)", () => {
    expect(
      resolveDailyCardsUiState({
        cooldownReady: true,
        allowed: false,
        currentDaily: { exists: false },
      })
    ).toBe("cooldown");
    expect(
      resolveDailyCardsUiState({
        cooldownReady: true,
        allowed: false,
        currentDaily: null,
      })
    ).toBe("cooldown");
  });

  it("TEST7: cooldown denied → daily_cards_started must not emit", () => {
    expect(
      shouldEmitDailyCardsStarted({
        cooldownReady: true,
        localAllowed: false,
        syncedAllowed: true,
      })
    ).toBe(false);
  });

  it("TEST8: ready + allowed after sync → started may emit", () => {
    expect(
      shouldEmitDailyCardsStarted({
        cooldownReady: true,
        localAllowed: true,
        syncedAllowed: true,
      })
    ).toBe(true);
  });

  it("TEST9: anonymous daily CTA is honest", () => {
    expect(EDITORIAL_DAILY_CARDS.guestCta).toMatch(/Открыть 3 карты сейчас/i);
    expect(EDITORIAL_DAILY_CARDS.guestCtaHint).toMatch(/раз в сутки/i);
  });

  it("home hide matches intro/triplet cardsKey but never hides daily via intro key", () => {
    const cardsKey = "deadbeef";
    const hidden = buildHomeRecapKey({ source: "guest_intro", cardsKey });
    expect(isHomeRecapHidden(buildHomeRecapKey({ source: "unknown", cardsKey }), hidden)).toBe(
      true
    );
    expect(isHomeRecapHidden(buildHomeRecapKey({ source: "triplet", cardsKey }), hidden)).toBe(true);
    expect(isHomeRecapHidden(buildHomeRecapKey({ source: "daily", cardsKey }), hidden)).toBe(false);
    expect(
      isHomeRecapHidden(buildHomeRecapKey({ source: "triplet", cardsKey: "other" }), hidden)
    ).toBe(false);
  });
});
