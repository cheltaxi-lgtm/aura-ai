import { describe, expect, it } from "vitest";
import { isRobotsPathAllowed } from "@/lib/seo/robots-policy";
import { CANONICAL_ALIASES } from "@/lib/seo/canonical-aliases";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import { getSeoArticleBySlug } from "@/lib/seo/articles";

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
      "/gadanie-po-ladoni",
      "/gadanie-po-ladoni/linii",
      "/gadanie-po-ladoni/znaki",
      "/gadanie-po-ladoni/po-foto",
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
    expect(CANONICAL_ALIASES["/khiromantiya"]).toBe("/gadanie-po-ladoni");
    expect(CANONICAL_ALIASES["/chiromantiya"]).toBe("/gadanie-po-ladoni");
    expect(CANONICAL_ALIASES["/ladon"]).toBe("/gadanie-po-ladoni");
    expect(CANONICAL_ALIASES["/gadanie-po-ladoni-po-foto"]).toBe("/gadanie-po-ladoni/po-foto");
    expect(CANONICAL_ALIASES["/levaya-ladon"]).toBe("/gadanie-po-ladoni/levaya");
    expect(CANONICAL_ALIASES["/rasklady/chto-chuvstvuet-ona"]).toBe(
      "/rasklady/chto-ona-chuvstvuet"
    );
  });
});

describe("webmaster title/description doubles", () => {
  it("splits freelance vs own-business titles", () => {
    const freelance = getSpreadIntentBySlug("frilans-ili-naym")!;
    const business = getSpreadIntentBySlug("rabota-ili-svoy-biznes")!;
    expect(freelance.seoTitle).toMatch(/Фриланс или найм/);
    expect(business.seoTitle).toMatch(/Работа или свой бизнес/);
    expect(freelance.seoTitle).not.toBe(business.seoTitle);
  });

  it("keeps joint-reading product title off the guide article", () => {
    const article = getSeoArticleBySlug("sovmestnyy-rasklad-dlya-dvoih")!;
    expect(article.title).not.toBe("Совместный расклад для двоих");
    expect(`${article.title} | Zovus`).not.toBe("Совместный расклад для двоих | Zovus");
  });

  it("gives his/her anger pages unique descriptions", () => {
    const his = getSpreadIntentBySlug("lyubov-pochemu-on-zlitsya")!;
    const hers = getSpreadIntentBySlug("lyubov-pochemu-ona-zlitsya")!;
    expect(his.seoDescription).not.toBe(hers.seoDescription);
    expect(his.seoDescription).toMatch(/его гнева/i);
    expect(hers.seoDescription).toMatch(/её гнева|ее гнева/i);
  });
});
