import { describe, expect, it } from "vitest";
import { buildDailyPrompt, buildDailySystem } from "@/lib/daily-energy";

describe("daily reading prompt", () => {
  it("keeps the free daily reading short and separate from paid markdown rules", () => {
    const prompt = buildDailySystem("veronika");
    expect(prompt).toContain("100–170 слов");
    expect(prompt).toContain("Утро —");
    expect(prompt).toContain("День —");
    expect(prompt).toContain("Вечер —");
    expect(prompt).toContain("календарную дату по Москве");
    expect(prompt).not.toContain("РЕЖИМ: оплаченный тематический расклад");
    expect(prompt).not.toContain("## Простыми словами");
    expect(prompt).not.toContain("28–40 предложений");
  });

  it("does not recycle the registration question into a new day's reading", () => {
    const params = {
      name: "Ева", zodiac: "Овен", birthDate: "1990-01-01", dateRu: "28 сентября 2026 г.",
      lifeFocus: "работа", mainQuestion: "Вернётся ли он?",
      cards: [
        { name: "Маг", meaning: "инициатива", reversed: false, position: "Утро" },
        { name: "Луна", meaning: "неясность", reversed: false, position: "День" },
        { name: "Солнце", meaning: "ясность", reversed: false, position: "Вечер" },
      ],
    };
    const prompt = buildDailyPrompt(params);
    expect(prompt).toContain("фокус: работа");
    expect(prompt).toContain("28 сентября 2026 г.");
    expect(prompt).not.toContain("Вернётся ли он?");
    expect(prompt).not.toContain("ближайшие 24 часа");
  });

  it("keeps the extended daily reading grounded in its own seven positions", () => {
    const prompt = buildDailySystem("veronika", "daily-extended");
    expect(prompt).toContain("240–360 слов");
    expect(prompt).toContain("из 7 символов");
    expect(prompt).not.toContain("РЕЖИМ: оплаченный тематический расклад");
  });
});
