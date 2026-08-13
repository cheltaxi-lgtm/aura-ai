/**
 * Daily 3-cards must not reuse the guest-intro situation triplet
 * (Прошлое / Настоящее / Будущее + registration teaser).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DAILY_TRIPLET_POSITIONS } from "@/lib/daily-triplet-positions";
import { EDITORIAL_DAILY_CARDS } from "@/lib/editorial-landing-content";
import { TRIPLET_UI_POSITIONS } from "@/lib/decks";
import { buildSpreadBlock } from "@/lib/spread-block";

const ROOT = path.resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("daily 3-cards vs guest-intro spread", () => {
  it("daily positions are Главное / Ресурс / Осторожность, not PPP", () => {
    expect([...DAILY_TRIPLET_POSITIONS]).toEqual(["Главное", "Ресурс", "Осторожность"]);
    expect(EDITORIAL_DAILY_CARDS.benefits.map((b) => b.title)).toEqual([
      ...DAILY_TRIPLET_POSITIONS,
    ]);
    expect([...TRIPLET_UI_POSITIONS]).toEqual(["Прошлое", "Настоящее", "Будущее"]);
    expect(DAILY_TRIPLET_POSITIONS).not.toEqual(TRIPLET_UI_POSITIONS);
  });

  it("daily prompt block works without a session question and uses daily positions", () => {
    const block = buildSpreadBlock("daily", ["Шут", "Маг", "Жрица"], undefined);
    expect(block).toMatch(/1я \(Главное\)/);
    expect(block).toMatch(/2я \(Ресурс\)/);
    expect(block).toMatch(/3я \(Осторожность\)/);
    expect(block).toMatch(/не стартовый расклад при регистрации/);
  });

  it("guest intro still uses deck PPP positions and does not import daily positions", () => {
    const guest = read("src/components/GuestTripletDraw.tsx");
    expect(guest).toMatch(/getDeckPositionsForUi/);
    expect(guest).not.toMatch(/DAILY_TRIPLET_POSITIONS/);
    expect(guest).toMatch(/Получить полный разбор/);
  });

  it("auth daily draw is three laid cards with daily positions, never MagicalSpreadTable", () => {
    const home = read("src/components/HomePage.tsx");
    expect(home).toMatch(/onOpenDailyCards=\{\(\) => void handleNewReading\(\)\}/);
    expect(home).toMatch(/variant=\{newTripletDraft \? "daily" : "default"\}/);
    const bannerStart = home.indexOf("<LoggedInHomeBanner");
    const bannerEnd = home.indexOf("<PersonalZovusHome", bannerStart);
    expect(bannerStart).toBeGreaterThan(-1);
    expect(bannerEnd).toBeGreaterThan(bannerStart);
    expect(home.slice(bannerStart, bannerEnd)).not.toMatch(/onQuestionSubmit/);
    const headerFnStart = home.indexOf("const handleStartReadingFromHeader");
    expect(headerFnStart).toBeGreaterThan(-1);
    const headerFn = home.slice(headerFnStart, home.indexOf("const handleNavRitual", headerFnStart));
    expect(headerFn).toMatch(/if \(!isLoggedIn\)/);
    expect(headerFn).toMatch(/startPersonalFlow/);
    expect(headerFn).toMatch(/handleNewReading/);
    expect(headerFn).toMatch(/openCurrentDailyCards/);
    const triplet = read("src/components/TarotTriplet.tsx");
    expect(triplet).toMatch(/DAILY_TRIPLET_POSITIONS/);
    expect(triplet).toMatch(/data-daily-triplet/);
    expect(triplet).toMatch(/Открыть расшифровку дня/);
    expect(triplet).toMatch(/не стартовый расклад при регистрации/);
    expect(triplet).not.toMatch(/MagicalSpreadTable/);
    expect(triplet).not.toMatch(/Выберите три карты/);
    expect(triplet).not.toMatch(/Получить полный разбор/);
    expect(triplet).not.toMatch(/GUEST_SPREAD_START_EVENT|startGuestSpread/);
    const banner = read("src/components/editorial/LoggedInHomeBanner.tsx");
    expect(banner).not.toMatch(/HeroQuestionField/);
    expect(banner).not.toMatch(/Разложить карты/);
    expect(banner).toMatch(/onOpenDailyCards/);
    expect(EDITORIAL_DAILY_CARDS.authAvailableCta).toBe("Открыть 3 карты дня");
    const header = read("src/components/AppTopHeader.tsx");
    expect(header).toMatch(/isLoggedIn \? "3 карты дня"/);
    expect(header).not.toMatch(/isLoggedIn \? "Получить расклад"/);
  });

  it("guest table title stays registration copy, not daily", () => {
    const guest = read("src/components/GuestTripletDraw.tsx");
    expect(guest).toMatch(/title="Выберите три карты"/);
    expect(guest).not.toMatch(/Выберите три карты дня/);
    expect(guest).toMatch(/Получить полный разбор/);
  });
});
