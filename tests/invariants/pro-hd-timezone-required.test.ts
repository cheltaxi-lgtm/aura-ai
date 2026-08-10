import { describe, expect, it } from "vitest";
import { computeHdFacts } from "@/modules/pro/adapters/chart-facts";

describe("Pro HD timezone required", () => {
  it("rejects missing timezone instead of silent Europe/Moscow", () => {
    const facts = computeHdFacts({
      birthDate: "1984-03-07",
      birthTime: "23:55",
      timeKnown: true,
      birthPlace: "Somewhere",
    });
    expect(facts.ok).toBe(false);
    expect(facts.error).toBe("timezone_required");
  });

  it("accepts explicit Europe/Berlin", () => {
    const facts = computeHdFacts({
      birthDate: "1984-03-07",
      birthTime: "23:55",
      timeKnown: true,
      birthPlace: "Potsdam, Brandenburg, Germany",
      timezone: "Europe/Berlin",
      latitude: 52.3989,
      longitude: 13.0657,
    });
    expect(facts.ok).toBe(true);
    expect(facts.timezone).toBe("Europe/Berlin");
    expect(facts.timeKnown).toBe(true);
  });
});
