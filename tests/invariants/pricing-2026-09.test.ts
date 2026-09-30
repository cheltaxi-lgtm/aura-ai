import { describe, expect, it } from "vitest";
import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { STARTER_BONUS_RUNES } from "@/lib/first-experience-policy";
import { DEFAULT_RUNE_SETTINGS } from "@/lib/rune-settings";
import { resolveSpreadCost } from "@/lib/spreads/spread-pricing";
import { photoReadingPricingFromSettings } from "@/lib/photo-reading-billing";
import { auraReadingPricingFromSettings } from "@/lib/aura-reading-billing";
import { palmReadingPricingFromSettings } from "@/lib/palm-reading-billing";
import { RITUAL_TYPES } from "@/lib/ritual-config";

describe("September 2026 published rune prices", () => {
  it("keeps the 5 ₽ base rate and grants 25 runes to new accounts", () => {
    expect(DEFAULT_RUNE_SETTINGS.rubPerRune).toBe(5);
    expect(STARTER_BONUS_RUNES).toBe(25);
  });

  it("prices core services in whole runes", () => {
    expect(DEFAULT_RUNE_COSTS).toMatchObject({
      QUESTION: 3, READING: 10, INTENTION_SPREAD: 16, JOINT_READING: 20,
      VISION_ANALYSIS: 15, NUMEROLOGY_SESSION: 60, MATRIX_SUBJECT_REPORT: 60,
      CHILD_MATRIX_REPORT: 20, MATRIX_PAIR_REPORT: 20, MATRIX_YEAR_FORECAST: 15,
      NATAL_READING: 100, FORECAST_REPORT: 15, SYNASTRY_REPORT: 20,
      HD_REPORT: 100, HD_COMPOSITE_REPORT: 120,
      AURA_READING: 40, PALM_READING: 40,
    });
    for (const cost of Object.values(DEFAULT_RUNE_COSTS)) expect(Number.isInteger(cost)).toBe(true);
  });

  it("publishes the charged price for every paid topic spread", () => {
    const expected = {
      triplet: 16, single: 8, "situation-5": 24, "triplet-love": 16,
      "love-7": 32, "yes-no": 8, "runes-yes-no": 8,
      "celtic-cross": 40, "week-overview": 32, "year-ahead": 50,
      "compatibility-12": 48, "lenormand-line": 24,
    } as const;
    for (const [id, cost] of Object.entries(expected)) {
      expect(resolveSpreadCost(id, DEFAULT_RUNE_SETTINGS)).toBe(cost);
    }
  });

  it("charges first and repeat photo reports as advertised", () => {
    expect(photoReadingPricingFromSettings(0).effectiveCost).toBe(15);
    expect(photoReadingPricingFromSettings(1).effectiveCost).toBe(15);
    expect(photoReadingPricingFromSettings(0).firstPhotoDiscount).toBe(false);
    expect(auraReadingPricingFromSettings(0).effectiveCost).toBe(20);
    expect(auraReadingPricingFromSettings(1).effectiveCost).toBe(40);
    expect(palmReadingPricingFromSettings(0).effectiveCost).toBe(25);
    expect(palmReadingPricingFromSettings(1).effectiveCost).toBe(40);
  });

  it("scales ritual prices to 80–200 runes", () => {
    expect(Object.fromEntries(Object.entries(RITUAL_TYPES).map(([id, value]) => [id, value.cost]))).toEqual({
      love: 200, money: 200, protection: 110, luck: 80,
      release: 140, health: 170, career: 170,
    });
  });

});
