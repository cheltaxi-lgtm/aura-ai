import { describe, expect, it } from "vitest";
import { buildSpreadTeaser } from "@/lib/spread-teaser";

describe("spread teaser", () => {
  it("shows a grounded card meaning before asking for a full reading", () => {
    const teaser = buildSpreadTeaser({
      userName: "Гость",
      cards: [
        { name: "Шут", meaning: "Новый путь, спонтанность, риск" },
        { name: "Звезда", meaning: "Надежда, исцеление, вдохновение" },
        { name: "Мир", meaning: "Завершение, целостность, интеграция" },
      ],
      positions: ["Прошлое", "Настоящее", "Будущее"],
      masterName: "Мастер",
    });

    expect(teaser).toContain("«Звезда» (Настоящее)");
    expect(teaser).toContain("Тема «Звезда»: Надежда, исцеление, вдохновение.");
    expect(teaser.indexOf("Надежда")).toBeLessThan(teaser.indexOf("Продолжите"));
  });

  it("does not invent a meaning when an older saved card has only a name", () => {
    const teaser = buildSpreadTeaser({
      userName: "Гость",
      cards: [{ name: "Звезда" }],
      positions: ["Совет"],
    });

    expect(teaser).toContain("Сильнее всего здесь звучит «Звезда».");
    expect(teaser).not.toContain("Тема «Звезда»:");
  });
});
