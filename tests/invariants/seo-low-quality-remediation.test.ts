import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LENORMAND_SYMBOLS } from "@/lib/decks/lenormand";
import {
  LENORMAND_COMBINATIONS,
  LEGACY_LENORMAND_COMBINATION_REDIRECTS,
  getAllLenormandCombinationSlugs,
} from "@/lib/seo/lenormand-combinations";
import { getCardSeoDeepDive } from "@/lib/seo/card-deep-dives";
import {
  FORECAST_MONTHS,
  getForecastYears,
  getMonthForecastMeta,
  getYearForecastMeta,
  getZodiacSignForecastMeta,
  isPastForecastMonth,
} from "@/lib/seo/seasonal";
import { SEO_ZODIAC_SIGNS } from "@/lib/seo/zodiac-signs";

const read = (relativePath: string) =>
  readFileSync(path.resolve(__dirname, "../..", relativePath), "utf8");

describe("low-quality SEO page remediation", () => {
  it("publishes only real Lenormand card pairs and redirects old invalid URLs", () => {
    const deckNames = new Set(LENORMAND_SYMBOLS.map((card) => card.name));
    const published = new Set(getAllLenormandCombinationSlugs());
    expect(published.size).toBe(LENORMAND_COMBINATIONS.length);
    for (const combination of LENORMAND_COMBINATIONS) {
      expect(combination.cards.every((name) => deckNames.has(name)), combination.slug).toBe(true);
    }
    for (const [oldSlug, destination] of Object.entries(LEGACY_LENORMAND_COMBINATION_REDIRECTS)) {
      expect(published.has(oldSlug), oldSlug).toBe(false);
      if (destination) expect(published.has(destination), destination).toBe(true);
    }
    expect(LEGACY_LENORMAND_COMBINATION_REDIRECTS["solnce-i-lebed"]).toBe("");
    expect(LEGACY_LENORMAND_COMBINATION_REDIRECTS["ryba-i-korabl"]).toBe("ryby-i-korabl");
  });

  it("removes expired month pages from search without hiding current pages", () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const january = FORECAST_MONTHS[0]!;
    const september = FORECAST_MONTHS[8]!;
    const october = FORECAST_MONTHS[9]!;
    expect(isPastForecastMonth(2026, january, now)).toBe(true);
    expect(isPastForecastMonth(2026, september, now)).toBe(false);
    expect(isPastForecastMonth(2026, october, now)).toBe(false);
    expect(getMonthForecastMeta(2026, january, now).noIndex).toBe(true);
    expect(getMonthForecastMeta(2026, september, now).noIndex).toBe(false);
    expect(read("src/app/sitemap.ts")).toContain("FORECAST_MONTHS.filter((month) => !isPastForecastMonth(year, month, now))");
  });

  it("rolls the forecast year and robots rules forward without another code change", () => {
    const december = new Date("2026-12-31T23:00:00.000Z");
    const january = new Date("2027-01-01T00:00:00.000Z");
    const sign = SEO_ZODIAC_SIGNS[0]!;
    expect(getForecastYears(december)).toEqual([2026, 2027]);
    expect(getForecastYears(january)).toEqual([2026, 2027, 2028]);
    expect(getYearForecastMeta(2026, january).noIndex).toBe(true);
    expect(getZodiacSignForecastMeta(sign, 2026, FORECAST_MONTHS[11], january).noIndex).toBe(true);
    for (const route of [
      "src/app/prognoz/page.tsx",
      "src/app/prognoz/[year]/page.tsx",
      "src/app/prognoz/[year]/[month]/page.tsx",
      "src/app/prognoz/znak/[sign]/page.tsx",
      "src/app/prognoz/znak/[sign]/[month]/page.tsx",
      "src/app/sitemap.ts",
    ]) {
      expect(read(route), route).toContain("export const revalidate = 3600");
    }
  });

  it("explains the Tarot Tower beyond one-line meanings", () => {
    const sections = getCardSeoDeepDive("bashnya");
    expect(sections?.length).toBeGreaterThanOrEqual(3);
    expect(sections?.some((section) => section.body.includes("позиции"))).toBe(true);
  });
});
