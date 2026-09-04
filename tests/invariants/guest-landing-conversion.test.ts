/**
 * Guest landing conversion cleanup — composition and copy invariants.
 * Does not touch receipt, billing, or daily entitlement mechanics.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_HERO_PAIN_CHIPS } from "@/lib/landing-offer";
import { EDITORIAL_DAILY_CARDS, EDITORIAL_HERO } from "@/lib/editorial-landing-content";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function guestLandingBranch(): string {
  const src = readSrc("src/components/AuraSellingLanding.tsx");
  const start = src.indexOf("if (isGuestEditorial)");
  const guestReturn = src.indexOf("return (", start);
  const nextReturn = src.indexOf("return (", guestReturn + 1);
  return src.slice(guestReturn, nextReturn);
}

describe("guest landing conversion cleanup", () => {
  it("hero pain chips stay at most 3", () => {
    expect(GUEST_HERO_PAIN_CHIPS.length).toBeLessThanOrEqual(3);
    expect(GUEST_HERO_PAIN_CHIPS.length).toBeGreaterThan(0);
  });

  it("hero copy is short and eligibility-safe", () => {
    expect(EDITORIAL_HERO.subtitle.length).toBeLessThan(140);
    const hero = readSrc("src/components/editorial/EditorialHeroSection.tsx");
    expect(hero).not.toContain("EDITORIAL_HERO.retentionHook");
    expect(hero).not.toContain("EDITORIAL_HERO.microcopy");
    expect(hero).toContain('StarterRunesValue variant="line"');
    expect(hero).not.toContain("Как проходит сеанс");
    expect(hero).toContain("expectationSubtitle");
  });

  it("guest conversion hero shows live social-proof counters", () => {
    const hero = readSrc("src/components/editorial/EditorialHeroSection.tsx");
    expect(hero).toContain("LandingSocialProofStats");
    expect(hero).toContain('variant="hero"');
    expect(hero).toContain("editorial-hero__proof");
    const landing = readSrc("src/components/AuraSellingLanding.tsx");
    expect(landing).toMatch(
      /useLandingSocialProofVisible\(\s*!isLoggedIn && \(isGuestEditorial/
    );
  });

  it("guest editorial hero receives A/B/C expectation copy", () => {
    const landing = readSrc("src/components/AuraSellingLanding.tsx");
    expect(landing).toContain("landingHeroExpectationCopy(heroVariant)");
    expect(landing).toContain("expectationSubtitle=");
  });

  it("saved guest continuation precedes hero; product discovery stays available below", () => {
    const guest = guestLandingBranch();
    expect(guest).not.toContain("<LandingDemoSection");
    expect(guest).not.toContain("<LandingHonestSection");
    const markers = [
      "<GuestTripletDraw",
      "<EditorialHeroSection",
      "<EditorialProductEntries",
      "<EditorialStarterGiftSection",
      "<EditorialSessionStepsSection",
      "<MastersShowcase",
      "<EditorialBirthToolsSection",
      "<EditorialDailyCardsSection",
      "<EditorialExtraFeaturesSection",
      "<EditorialReviewsSection",
      "<LandingSeoHub",
      "<LandingClosingBand",
      "<LandingStickyCta",
    ];
    let last = -1;
    for (const marker of markers) {
      const idx = guest.indexOf(marker);
      expect(idx, marker).toBeGreaterThan(last);
      last = idx;
    }
    expect(guest).not.toContain("<EditorialFreeValueSection");
    expect(guest).not.toContain("<EditorialStarterPackSection");
    expect(guest).not.toContain("<EditorialPracticesSection");
  });

  it("guest reviews sit before SeoHub and stay pending until moderation", () => {
    const guest = guestLandingBranch();
    expect(guest.indexOf("<EditorialReviewsSection")).toBeLessThan(guest.indexOf("<LandingSeoHub"));
    const reviews = readSrc("src/components/editorial/EditorialReviewsSection.tsx");
    expect(reviews).not.toContain("<form");
    expect(reviews).not.toContain("Отправить на модерацию");
    const form = readSrc("src/components/cabinet/CabinetReviewForm.tsx");
    expect(form).toContain('attachRecaptchaToken(payload, "reviews"');
    expect(form).toContain("Отправить на модерацию");
    expect(reviews).not.toMatch(/реальн(ые|ый|ых) (покупател|отзыв)/i);
    expect(reviews).toContain("/api/reviews");
  });

  it("SeoHub comes before the final CTA, not after", () => {
    const guest = guestLandingBranch();
    expect(guest.indexOf("<LandingSeoHub")).toBeLessThan(guest.indexOf("<LandingClosingBand"));
    expect(guest).toContain("hidePricingNote");
    const closing = readSrc("src/components/seo/LandingClosingBand.tsx");
    expect(closing).not.toContain("LandingFaqSection");
  });

  it("BirthTools helps choose Matrix + Natal + HD on canonical routes", () => {
    const src = readSrc("src/components/editorial/EditorialBirthToolsSection.tsx");
    expect(src).toContain("Что выбрать по дате рождения?");
    expect(src).toContain("/numerology/destiny-matrix");
    expect(src).toContain("/natalnaya-karta");
    expect(src).toContain("/dizayn-cheloveka/rasschitat");
    expect(src).toContain("humanDesignEnabled");
  });

  it("guest extra features show PhotoTarot + Numerology, not a core-product catalog", () => {
    const extra = readSrc("src/components/editorial/EditorialExtraFeaturesSection.tsx");
    expect(extra).toContain("ФотоТаро");
    expect(extra).toContain("Нумерология");
    expect(extra).toContain("/landing/practices/photo-tarot.jpg");
    expect(extra).toContain("/landing/practices/numerology.jpg");
    expect(extra).toContain('href="/numerology"');
    expect(extra).toContain("resolveRegistrationReturnTo({ photo: true })");
    expect(extra).not.toContain("Другие форматы Zovus");
    expect(extra).not.toContain("Матрица судьбы");
    expect(extra).not.toContain("Классическое Таро");
    expect(extra).not.toContain("Натальная карта");
    expect(extra).not.toContain("Дизайн человека");
    expect(extra).not.toContain("/natalnaya-karta");
    expect(extra).not.toContain("/dizayn-cheloveka");
    expect(extra).not.toContain("destiny-matrix");
  });

  it("extra features use live server rune config and gate free copy on starter >= cost", () => {
    const extra = readSrc("src/components/editorial/EditorialExtraFeaturesSection.tsx");
    expect(extra).toContain("config.starterRunes");
    expect(extra).toContain("VISION_ANALYSIS");
    expect(extra).toContain("NUMEROLOGY_SESSION");
    expect(extra).toContain("fromServer");
    expect(extra).toContain("starter >= photoCost");
    expect(extra).toContain("starter >= numerologyCost");
    expect(extra).not.toMatch(/starterRunes\s*=\s*300/);
    expect(extra).not.toMatch(/starter\s*=\s*300/);
    expect(extra).not.toContain("300ᚢ");
  });

  it("starter wording stays eligibility-safe and server-config driven", () => {
    const value = readSrc("src/components/auth/StarterRunesValue.tsx");
    const gift = readSrc("src/components/editorial/EditorialStarterGiftSection.tsx");
    expect(value).toContain("При первой регистрации — стартовые {starter} ᚢ");
    expect(gift).toContain("При первой регистрации — {starter} ᚢ");
    expect(gift).toContain("config.starterRunes");
    expect(gift).toContain("config.costs[example.costKey]");
    expect(gift).not.toMatch(/starterRunes\s*=\s*\d{2,}/);
  });

  it("daily guest CTA no longer promises a free daily triplet", () => {
    expect(EDITORIAL_DAILY_CARDS.guestCta).toBe("Открыть первые 3 карты");
    expect(EDITORIAL_DAILY_CARDS.guestCta).not.toMatch(/Попробовать 3 карты бесплатно/i);
    expect(EDITORIAL_DAILY_CARDS.guestCtaHint).toMatch(/раз в сутки/i);
  });

  it("final CTA no longer says three cards are free and shows server starter line", () => {
    const finalCta = readSrc("src/components/seo/LandingFinalCtaSection.tsx");
    expect(finalCta).not.toContain("Три карты бесплатно");
    expect(finalCta).toContain("Открыть 3 карты");
    expect(finalCta).toContain('StarterRunesValue variant="line" generic product="home_final"');
  });

  it("sticky CTA label is unchanged", () => {
    const guest = guestLandingBranch();
    expect(guest).toContain('label="Открыть 3 карты"');
  });
});
