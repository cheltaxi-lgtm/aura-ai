import { describe, expect, it } from "vitest";
import {
  resolveDailyCardsUiState,
  shouldEmitDailyCardsStarted,
} from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS } from "@/lib/editorial-landing-content";

describe("daily cards UI state + analytics gating", () => {
  it("TEST4: cooldown not ready → loading (not available)", () => {
    expect(
      resolveDailyCardsUiState({ cooldownReady: false, allowed: true })
    ).toBe("loading");
    expect(
      resolveDailyCardsUiState({ cooldownReady: false, allowed: false })
    ).toBe("loading");
    expect(
      resolveDailyCardsUiState({ cooldownReady: false, allowed: undefined })
    ).toBe("loading");
  });

  it("TEST5: ready + allowed → available", () => {
    expect(
      resolveDailyCardsUiState({ cooldownReady: true, allowed: true })
    ).toBe("available");
  });

  it("TEST6: ready + denied → used", () => {
    expect(
      resolveDailyCardsUiState({ cooldownReady: true, allowed: false })
    ).toBe("used");
    expect(
      resolveDailyCardsUiState({ cooldownReady: true, allowed: null })
    ).toBe("used");
  });

  it("TEST7: cooldown denied → daily_cards_started must not emit", () => {
    expect(
      shouldEmitDailyCardsStarted({
        cooldownReady: true,
        localAllowed: false,
        syncedAllowed: true,
      })
    ).toBe(false);
    expect(
      shouldEmitDailyCardsStarted({
        cooldownReady: false,
        localAllowed: true,
        syncedAllowed: true,
      })
    ).toBe(false);
    expect(
      shouldEmitDailyCardsStarted({
        cooldownReady: true,
        localAllowed: true,
        syncedAllowed: false,
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

  it("TEST9: anonymous daily CTA is honest (not claiming daily open now)", () => {
    expect(EDITORIAL_DAILY_CARDS.guestCta).toMatch(/Открыть 3 карты сейчас/i);
    expect(EDITORIAL_DAILY_CARDS.guestCta).not.toMatch(/получить мои карты дня/i);
    expect(EDITORIAL_DAILY_CARDS.guestCtaHint).toMatch(/после регистрации/i);
    expect(EDITORIAL_DAILY_CARDS.guestCtaHint).toMatch(/раз в сутки/i);
  });
});
