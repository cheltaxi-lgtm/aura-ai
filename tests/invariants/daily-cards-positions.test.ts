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

  it("auth daily draw mounts TarotTriplet in daily variant via handleNewReading", () => {
    const home = read("src/components/HomePage.tsx");
    expect(home).toMatch(/onOpenDailyCards=\{\(\) => void handleNewReading\(\)\}/);
    expect(home).toMatch(/variant=\{newTripletDraft \? "daily" : "default"\}/);
    const triplet = read("src/components/TarotTriplet.tsx");
    expect(triplet).toMatch(/DAILY_TRIPLET_POSITIONS/);
    expect(triplet).toMatch(/Открыть расшифровку дня/);
  });
});
