/**
 * P1.3: Personal Zovus — auth home blocks; guest multiproduct landing untouched.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPersonalContinueItems,
  PERSONAL_ZOVUS_EXPLORE,
} from "@/lib/personal-zovus-home";
import { isDrawnExtendedDailyReading } from "@/lib/daily-reading-peek";
import { EDITORIAL_PRODUCT_ENTRIES } from "@/lib/editorial-landing-content";

const ROOT = path.resolve(__dirname, "../..");

describe("personal-zovus-home", () => {
  it("guest homepage still mounts multiproduct EditorialProductEntries", () => {
    const landing = readFileSync(
      path.join(ROOT, "src/components/AuraSellingLanding.tsx"),
      "utf8"
    );
    expect(landing).toMatch(/EditorialProductEntries/);
    expect(EDITORIAL_PRODUCT_ENTRIES).toHaveLength(4);
  });

  it("auth home mounts photo hero without stacking selling CTAs", () => {
    const home = readFileSync(path.join(ROOT, "src/components/HomePage.tsx"), "utf8");
    expect(home).toMatch(/<LoggedInHomeBanner/);
    expect(home).toMatch(/PersonalZovusHome/);
    expect(home).toMatch(/showHeroBlocks=\{false\}/);
    expect(home).toMatch(/showTariffs=\{false\}/);
    expect(home).toMatch(/onViewTodayDailyCards=\{\(\) => void openCurrentDailyCards\(\)\}/);
    expect(home).toMatch(/onOpenDailyCards=\{\(\) => void handleNewReading\(\)\}/);
    expect(home).not.toMatch(/<CabinetNatalChart \/>/);
    const landing = readFileSync(
      path.join(ROOT, "src/components/AuraSellingLanding.tsx"),
      "utf8"
    );
    expect(landing).toMatch(/isAuthQuietMain/);
    expect(landing).toMatch(/!isAuthQuietMain &&/);
    const banner = readFileSync(
      path.join(ROOT, "src/components/editorial/LoggedInHomeBanner.tsx"),
      "utf8"
    );
    expect(banner).toMatch(/\/landing\/hero\.jpg/);
    expect(banner).toMatch(/editorial-hero--logged-in/);
    expect(banner).not.toMatch(/HeroQuestionField/);
    expect(banner).not.toMatch(/chipClass|editorial-hero__chip/);
    expect(banner).not.toMatch(/onOpenDailyCards/);
    const css = readFileSync(
      path.join(ROOT, "src/styles/editorial-landing.css"),
      "utf8"
    );
    expect(css).toMatch(
      /\.editorial-hero\.editorial-hero--logged-in \{[\s\S]*?min-height:\s*0/
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*?\.editorial-hero\.editorial-hero--logged-in \{[\s\S]*?padding-top:\s*calc\(var\(--app-header-h/
    );
    expect(css).not.toMatch(
      /\.editorial-hero\.editorial-hero--logged-in \{[\s\S]*?min-height:\s*clamp\(32rem/
    );
    expect(css).toMatch(
      /@media \(min-width: 900px\) \{[\s\S]*?\.personal-zovus__list \{[\s\S]*?grid-template-columns:\s*1fr 1fr/
    );
  });

  it("logged-in mobile header CTA stays short so the bar does not overflow", () => {
    const header = readFileSync(
      path.join(ROOT, "src/components/AppTopHeader.tsx"),
      "utf8"
    );
    const [, afterMobile] = header.split("app-top-header__mobile");
    expect(afterMobile).toMatch(/>\s*Расклад\s*</);
    expect(afterMobile).not.toMatch(/3 карты дня/);
    expect(header).toMatch(/\{isLoggedIn \? "3 карты дня" : "Получить расклад"\}/);
  });

  it("explore links cover Matrix, Natal, HD, Tarot, matrix compatibility", () => {
    const byId = Object.fromEntries(PERSONAL_ZOVUS_EXPLORE.map((e) => [e.id, e]));
    expect(byId.matrix?.href).toBe("/numerology/destiny-matrix");
    expect(byId.natal?.href).toBe("/natalnaya-karta");
    expect(byId.hd?.href).toBe("/dizayn-cheloveka/rasschitat");
    expect(byId.tarot?.kind).toBe("action");
    expect(byId.matrix_pair?.href).toBe("/numerology/matrica-sovmestimosti");
  });

  it("continue omits empty ownership and includes owned artifacts only", () => {
    expect(buildPersonalContinueItems({})).toEqual([]);
    expect(
      buildPersonalContinueItems({
        tarotMasterName: "  ",
        matrixOwned: false,
        natalChartReady: false,
        hdChartId: null,
      })
    ).toEqual([]);

    const items = buildPersonalContinueItems({
      tarotMasterName: "Мира",
      matrixOwned: true,
      natalChartReady: true,
      hdChartId: "hd-1",
    });
    expect(items.map((i) => i.kind)).toEqual(["tarot", "matrix", "natal", "hd"]);
    expect(items.find((i) => i.kind === "matrix")?.href).toMatch(/numerolog=1/);
    expect(items.find((i) => i.kind === "natal")?.href).toBe("/cabinet/astrology");
    expect(items.find((i) => i.kind === "hd")?.href).toBe(
      "/cabinet/human-design?chart=hd-1"
    );
  });

  it("PersonalZovusHome does not mint birth profile UI", () => {
    const src = readFileSync(
      path.join(ROOT, "src/components/editorial/PersonalZovusHome.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/OnboardingForm|birthDate.*required|Дата рождения/);
    expect(src).toMatch(/buildPersonalContinueItems/);
    expect(src).toMatch(/PERSONAL_ZOVUS_EXPLORE/);
  });

  it("header peek treats 7-card daily-extended as drawn, not a free triplet", () => {
    expect(
      isDrawnExtendedDailyReading({
        drawn: true,
        text: "Утро несёт ясность.",
        spreadId: "daily-extended",
        cards: new Array(7).fill({ name: "Шут" }),
      })
    ).toBe(true);
    expect(
      isDrawnExtendedDailyReading({
        drawn: true,
        text: "Короткий день.",
        spreadId: "classic-3",
        cards: [{ name: "Шут" }, { name: "Маг" }, { name: "Жрица" }],
      })
    ).toBe(false);
  });

  it("hidden recap path: tarot continue only when HomePage passes master name from active recap", () => {
    const home = readFileSync(path.join(ROOT, "src/components/HomePage.tsx"), "utf8");
    expect(home).toMatch(/tarotContinueMasterName=\{/);
    expect(home).toMatch(/hasActiveSpread && recapContinueMasterId/);
  });
});
