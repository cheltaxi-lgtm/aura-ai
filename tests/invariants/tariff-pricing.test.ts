import { describe, expect, it } from "vitest";
import { intentionSpreadPriceRange } from "@/lib/tariff-pricing";
import { DEFAULT_SPREAD_CATALOG_SETTINGS } from "@/lib/spreads/types";
import { RITUAL_TYPE_KEYS } from "@/lib/ritual-config";
import { DEFAULT_RITUAL_SETTINGS, ritualCostFromSettings } from "@/lib/ritual-settings";

describe("public tariff catalog prices", () => {
  it("uses the charged spread multiplier range and omits the daily-only scheme", () => {
    expect(intentionSpreadPriceRange(20, DEFAULT_SPREAD_CATALOG_SETTINGS)).toEqual({ min: 10, max: 70 });
    expect(intentionSpreadPriceRange(20, { spreadsCatalogEnabled: false, spreadOverrides: {} })).toEqual({ min: 20, max: 20 });
    expect(intentionSpreadPriceRange(20, {
      spreadsCatalogEnabled: true,
      spreadOverrides: { "year-ahead": { enabled: false }, single: { costMultiplier: 1.25 } },
    })).toEqual({ min: 10, max: 60 });
  });

  it("reads ritual prices from the same settings as ritual creation", () => {
    expect(RITUAL_TYPE_KEYS).toHaveLength(7);
    const settings = {
      ...DEFAULT_RITUAL_SETTINGS,
      types: { ...DEFAULT_RITUAL_SETTINGS.types, love: { enabled: true, cost: 425 } },
    };
    expect(ritualCostFromSettings(settings, "love")).toBe(425);
  });
});
