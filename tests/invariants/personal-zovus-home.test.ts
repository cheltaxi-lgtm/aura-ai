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

  it("auth salon home mounts PersonalZovusHome with server-authoritative daily CTAs", () => {
    const home = readFileSync(path.join(ROOT, "src/components/HomePage.tsx"), "utf8");
    expect(home).toMatch(/PersonalZovusHome/);
    expect(home).toMatch(/onViewTodayDailyCards=\{\(\) => void openCurrentDailyCards\(\)\}/);
    expect(home).toMatch(/onOpenDailyCards=\{\(\) => void handleNewReading\(\)\}/);
    expect(home).not.toMatch(
      /step === "masters" && showPersonalSalonContent && isLoggedIn \? \(\s*<LoggedInHomeBanner/
    );
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

  it("hidden recap path: tarot continue only when HomePage passes master name from active recap", () => {
    const home = readFileSync(path.join(ROOT, "src/components/HomePage.tsx"), "utf8");
    expect(home).toMatch(/tarotContinueMasterName=\{/);
    expect(home).toMatch(/hasActiveSpread && recapContinueMasterId/);
  });
});
