import { describe, expect, it } from "vitest";
import { buildLandingOfferCopy } from "@/lib/landing-offer";
import {
  EDITORIAL_DAILY_CARDS,
  EDITORIAL_FREE_VALUE,
  EDITORIAL_HERO,
} from "@/lib/editorial-landing-content";
import {
  GUEST_RESUME_ALREADY_USED,
  GUEST_RESUME_ALREADY_USED_DAILY_CTA,
} from "@/lib/guest-triplet-resume";
import { tripletCooldownFromLastDraw } from "@/lib/triplet-limit";

describe("daily retention product copy (honest 24h)", () => {
  it("TEST15: anonymous landing sells consumer benefit without internal jargon", () => {
    expect(EDITORIAL_HERO.primaryCta).toMatch(/3 карты/i);
    expect(EDITORIAL_HERO.retentionHook).toMatch(/3 карты/i);
    expect(EDITORIAL_DAILY_CARDS.body).toMatch(/раз в сутки/i);
    expect(EDITORIAL_DAILY_CARDS.body).not.toMatch(/не путать/i);
    expect(EDITORIAL_DAILY_CARDS.kicker).not.toMatch(/После регистрации/i);
    expect(EDITORIAL_FREE_VALUE.items.some((i) => /карты дня/i.test(i.title))).toBe(true);
  });

  it("landing offer pricing mentions daily without false calendar promise", () => {
    const offer = buildLandingOfferCopy(
      {
        enabled: false,
        freeQuestions: 3,
        costs: { READING: 10 } as never,
      } as never,
      (n) => `${n}`,
      undefined,
      "a"
    );
    expect(offer.heroRetentionHook).toMatch(/3 карты/i);
    expect(offer.seoFreeParagraph).toMatch(/раз в сутки/i);
    expect(offer.seoFreeParagraph).toMatch(/один стартовый/i);
  });

  it("TEST19: already-used UX points to daily cards", () => {
    expect(GUEST_RESUME_ALREADY_USED).toMatch(/один раз/i);
    expect(GUEST_RESUME_ALREADY_USED).toMatch(/раз в сутки/i);
    expect(GUEST_RESUME_ALREADY_USED_DAILY_CTA).toMatch(/карты дня/i);
  });

  it("TEST9/10/11: daily 3-cards reset at 00:00 Europe/Moscow, not rolling 24h", () => {
    const lastEvening = new Date("2026-08-13T20:30:00.000Z");
    const beforeMidnight = tripletCooldownFromLastDraw(
      lastEvening,
      new Date("2026-08-13T20:59:00.000Z")
    );
    expect(beforeMidnight.allowed).toBe(false);
    expect(beforeMidnight.nextAvailableAt).toBe("2026-08-13T21:00:00.000Z");

    const afterMidnight = tripletCooldownFromLastDraw(
      lastEvening,
      new Date("2026-08-13T21:00:01.000Z")
    );
    expect(afterMidnight.allowed).toBe(true);
  });
});
