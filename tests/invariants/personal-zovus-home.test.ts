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

  it("auth salon home mounts photo hero without the Сегодня daily-cards card", () => {
    const home = readFileSync(path.join(ROOT, "src/components/HomePage.tsx"), "utf8");
    expect(home).toMatch(/auth-salon-home/);
    expect(home).toMatch(/<LoggedInHomeBanner/);
    expect(home).toMatch(/PersonalZovusHome/);
    expect(home).toMatch(/showHeroBlocks=\{false\}/);
    expect(home).toMatch(/onViewTodayDailyCards=\{\(\) => void openCurrentDailyCards\(\)\}/);
    expect(home).toMatch(/onOpenDailyCards=\{\(\) => void handleNewReading\(\)\}/);
    expect(home).not.toMatch(/onOpenDailyCards=\{\(\) => void startPersonalFlow\(\)\}/);
    expect(home).not.toMatch(/onOpenDailyCards=\{\(\) => startGuestSpread/);
    const bannerStart = home.indexOf("<LoggedInHomeBanner");
    const personalStart = home.indexOf("<PersonalZovusHome", bannerStart);
    expect(bannerStart).toBeGreaterThan(-1);
    expect(personalStart).toBeGreaterThan(bannerStart);
    expect(home.slice(bannerStart, personalStart)).not.toMatch(/onOpenDailyCards|onViewTodayDailyCards/);
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

  it("LoggedInHomeBanner keeps photographic hero and does not render the daily-cards card", () => {
    const banner = readFileSync(
      path.join(ROOT, "src/components/editorial/LoggedInHomeBanner.tsx"),
      "utf8"
    );
    expect(banner).toMatch(/\/landing\/hero\.jpg/);
    expect(banner).toMatch(/editorial-hero--logged-in/);
    expect(banner).not.toMatch(/DailyCardsReminderToggle/);
    expect(banner).not.toMatch(/editorial-hero__daily/);
    expect(banner).not.toMatch(/onOpenDailyCards/);
    expect(banner).not.toMatch(/Посмотреть карты дня/);
    expect(banner).not.toMatch(/HeroQuestionField/);
    expect(banner).not.toMatch(/Разложить карты/);
  });

  it("auth hero is compact; guest editorial hero keeps 74vh min-height", () => {
    const css = readFileSync(
      path.join(ROOT, "src/styles/editorial-landing.css"),
      "utf8"
    );
    expect(css).toMatch(/\.editorial-hero \{[\s\S]*?min-height:\s*clamp\(32rem,\s*74vh,\s*44rem\)/);
    expect(css).toMatch(/\.editorial-hero--logged-in \{[\s\S]*?min-height:\s*0;/);
    expect(css).toMatch(/\.personal-zovus--salon/);
    const personal = readFileSync(
      path.join(ROOT, "src/components/editorial/PersonalZovusHome.tsx"),
      "utf8"
    );
    expect(personal).toMatch(/personal-zovus--salon/);
  });

  it("handleNewReading opens daily triplet, not onboarding or guest intro", () => {
    const src = readFileSync(path.join(ROOT, "src/hooks/useOnboardingFlow.ts"), "utf8");
    const start = src.indexOf("const handleNewReading = async");
    expect(start).toBeGreaterThan(-1);
    const fn = src.slice(start, src.indexOf("\n  useEffect(", start));
    expect(fn).toMatch(/if \(!isLoggedIn\) return/);
    expect(fn).not.toMatch(/setStep\("onboarding"\)/);
    expect(fn).toMatch(/setNewTripletDraft\(true\)/);
    expect(fn).toMatch(/setStep\("triplet"\)/);
    expect(fn).not.toMatch(/startGuestSpread|GUEST_SPREAD_START_EVENT/);
  });

  it("guest landing daily CTA still starts guest intro spread", () => {
    const landing = readFileSync(
      path.join(ROOT, "src/components/AuraSellingLanding.tsx"),
      "utf8"
    );
    expect(landing).toMatch(/EditorialDailyCardsSection/);
    expect(landing).toMatch(/onGuestCta=\{\(\) => startGuestSpread\(\)\}/);
    expect(landing).not.toMatch(/handleNewReading/);
  });

  it("hidden recap path: tarot continue only when HomePage passes master name from active recap", () => {
    const home = readFileSync(path.join(ROOT, "src/components/HomePage.tsx"), "utf8");
    expect(home).toMatch(/tarotContinueMasterName=\{/);
    expect(home).toMatch(/hasActiveSpread && recapContinueMasterId/);
  });
});
