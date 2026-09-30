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
import { TRIPLET_COOLDOWN_MS, tripletCooldownFromLastDraw } from "@/lib/triplet-limit";

describe("daily retention product copy (honest 24h)", () => {
  it("TEST15: anonymous landing sells consumer benefit without internal jargon", () => {
    expect(EDITORIAL_HERO.primaryCta).toMatch(/3 карты/i);
    expect(EDITORIAL_HERO.retentionHook).toMatch(/расклад на сутки/i);
    expect(EDITORIAL_DAILY_CARDS.body).toMatch(/раз в сутки/i);
    expect(EDITORIAL_DAILY_CARDS.body).not.toMatch(/не путать/i);
    expect(EDITORIAL_DAILY_CARDS.kicker).not.toMatch(/После регистрации/i);
    expect(EDITORIAL_FREE_VALUE.items.some((i) => /расклад на сутки/i.test(i.title))).toBe(true);
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
    expect(offer.heroRetentionHook).toMatch(/расклад на сутки/i);
    expect(offer.seoFreeParagraph).toMatch(/расклад на сутки/i);
    expect(offer.seoFreeParagraph).toMatch(/один стартовый/i);
  });

  it("TEST19: already-used UX points to the daily reading", () => {
    expect(GUEST_RESUME_ALREADY_USED).toMatch(/один раз/i);
    expect(GUEST_RESUME_ALREADY_USED).toMatch(/расклад на сутки/i);
    expect(GUEST_RESUME_ALREADY_USED_DAILY_CTA).toMatch(/расклад на сутки/i);
  });

  it("TEST9/10/11: rolling 24h daily rule (not calendar midnight)", () => {
    expect(TRIPLET_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000);
    const now = Date.now();
    const justUsed = tripletCooldownFromLastDraw(new Date(now - 1000).toISOString());
    expect(justUsed.allowed).toBe(false);
    const afterWindow = tripletCooldownFromLastDraw(
      new Date(now - TRIPLET_COOLDOWN_MS - 1000).toISOString()
    );
    expect(afterWindow.allowed).toBe(true);
  });
});
