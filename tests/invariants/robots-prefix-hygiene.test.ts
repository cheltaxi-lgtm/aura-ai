import { describe, expect, it } from "vitest";
import { isRobotsPathAllowed } from "@/lib/seo/robots-policy";
import { CANONICAL_ALIASES } from "@/lib/seo/canonical-aliases";

describe("robots prefix hygiene", () => {
  it("allows public product and forecast URLs", () => {
    for (const path of [
      "/",
      "/prognoz",
      "/prognoz/2026",
      "/prognoz/2026/sentyabr",
      "/prognoz/znak/oven",
      "/telegram",
      "/taro",
      "/gadanie",
      "/rasklady",
      "/rasklady/poceluet-li-on",
      "/aura",
      "/aura/cveta",
      "/photo-rasklad",
      "/numerology/destiny-matrix",
      "/natalnaya-karta",
      "/dizayn-cheloveka/rasschitat",
      "/partners",
      "/privacy",
    ]) {
      expect(isRobotsPathAllowed(path), path).toBe(true);
    }
  });

  it("blocks private trees without leaking onto public prefixes", () => {
    for (const path of [
      "/pro",
      "/pro/clients",
      "/tg",
      "/tg/",
      "/app",
      "/app/",
      "/cabinet",
      "/cabinet/astrology",
      "/session/intention",
      "/joint-reading/abc",
      "/dizayn-cheloveka/karta/abc",
      "/photo-rasklad/result",
      "/api/health",
    ]) {
      expect(isRobotsPathAllowed(path), path).toBe(false);
    }
  });
});

describe("canonical alias consolidation", () => {
  it("folds alias landings onto one product URL", () => {
    expect(CANONICAL_ALIASES["/matrix-destiny"]).toBe("/numerology/destiny-matrix");
    expect(CANONICAL_ALIASES["/astrology"]).toBe("/natalnaya-karta");
    expect(CANONICAL_ALIASES["/bodigraf"]).toBe("/dizayn-cheloveka/rasschitat");
    expect(CANONICAL_ALIASES["/taro-po-foto"]).toBe("/photo-rasklad");
    expect(CANONICAL_ALIASES["/aura-po-foto"]).toBe("/aura");
  });
});
