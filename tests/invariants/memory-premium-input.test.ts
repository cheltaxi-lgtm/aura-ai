import { describe, expect, it } from "vitest";
import { isQualityMemoryFact, validateUserSubmittedFact } from "@/lib/memory/user-fact-input";

describe("real-life memory inputs", () => {
  it("does not turn savings or income into debt", () => {
    expect(validateUserSubmittedFact("Я накопил миллион рублей", "money")?.predicateKey).toBe("other");
    expect(validateUserSubmittedFact("У меня долг по кредиту", "money")?.predicateKey).toBe("finance.debt");
  });
  it("rejects impossible dates and preserves leap days", () => {
    expect(validateUserSubmittedFact("Переезд в Москву", "event", "2026-02-31")).toBeNull();
    expect(validateUserSubmittedFact("Переезд в Москву", "event", "2028-02-29")?.eventDate).toBe("2028-02-29");
  });
  it("accepts ordinary words but rejects divination as biography", () => {
    expect(isQualityMemoryFact("Я люблю картофель")).toBe(true);
    expect(isQualityMemoryFact("Клиент работает картографом")).toBe(true);
    expect(isQualityMemoryFact("Карты предсказывают свадьбу")).toBe(false);
    expect(isQualityMemoryFact("Руны обещают богатство")).toBe(false);
  });
});
