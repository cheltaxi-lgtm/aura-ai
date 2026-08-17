/**
 * Guest landing conversion cleanup — composition and copy invariants.
 * Does not touch receipt, billing, or daily entitlement mechanics.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUEST_HERO_PAIN_CHIPS } from "@/lib/landing-offer";
import { EDITORIAL_HERO, EDITORIAL_PRACTICES } from "@/lib/editorial-landing-content";

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
    expect(EDITORIAL_HERO.microcopy.toLowerCase()).toContain("без регистрации");
    expect(EDITORIAL_HERO.microcopy).toContain("18+");
    const hero = readSrc("src/components/editorial/EditorialHeroSection.tsx");
    expect(hero).not.toContain("EDITORIAL_HERO.retentionHook");
    expect(hero).toContain('StarterRunesValue variant="line"');
    expect(hero).not.toContain("Как проходит сеанс");
  });

  it("guest landing order is hero → products → demo → starter → masters → birth → daily → honest → practices → seo → faq/cta", () => {
    const guest = guestLandingBranch();
    const markers = [
      "<EditorialHeroSection",
      "<EditorialProductEntries",
      "<GuestTripletDraw",
      "<LandingDemoSection",
      "<EditorialStarterGiftSection",
      "<EditorialSessionStepsSection",
      "<MastersShowcase",
      "<EditorialBirthToolsSection",
      "<EditorialDailyCardsSection",
      "<LandingHonestSection",
      "<EditorialPracticesSection",
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
  });

  it("SeoHub comes before FAQ/final CTA, not after", () => {
    const guest = guestLandingBranch();
    expect(guest.indexOf("<LandingSeoHub")).toBeLessThan(guest.indexOf("<LandingClosingBand"));
  });

  it("BirthTools helps choose Matrix + Natal + HD on canonical routes", () => {
    const src = readSrc("src/components/editorial/EditorialBirthToolsSection.tsx");
    expect(src).toContain("Что выбрать по дате рождения?");
    expect(src).toContain("/numerology/destiny-matrix");
    expect(src).toContain("/natalnaya-karta");
    expect(src).toContain("/dizayn-cheloveka/rasschitat");
    expect(src).toContain("humanDesignEnabled");
  });

  it("guest practices keep the full existing card set", () => {
    expect(EDITORIAL_PRACTICES.map((p) => p.id)).toEqual([
      "photo",
      "numerology",
      "matrix",
      "tarot",
      "natal",
    ]);
    const practices = readSrc("src/components/editorial/EditorialPracticesSection.tsx");
    expect(practices).toContain("Другие форматы Zovus");
    expect(practices).toContain("EDITORIAL_PRACTICES.map");
    expect(practices).not.toContain("additionalFormats");
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

  it("sticky CTA label is unchanged", () => {
    const guest = guestLandingBranch();
    expect(guest).toContain('label="Открыть 3 карты"');
  });
});
