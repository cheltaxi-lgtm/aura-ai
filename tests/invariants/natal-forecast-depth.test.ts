import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeTimingEventPlain } from "@/lib/natal/labels";
import { buildNatalReportJsonInstructions, salvageNatalReport } from "@/lib/natal/report";
import type { NatalEvidence } from "@/lib/natal/evidence";

// Regression: a 7-day forecast shipped ~150 chars/section because the prompt
// asked for "не менее 180 знаков" and the final evidence salvage accepted the
// thin result without the substantive gate. Paid forecasts must stay deep or
// fail closed (route refunds), never degrade to stub sentences.
describe("natal 7-day forecast depth contract", () => {
  it("prompt requires substantive sections for a 7-day forecast", () => {
    const instructions = buildNatalReportJsonInstructions("western", "forecast", 7);
    expect(instructions).toContain("не менее 320 знаков");
    expect(instructions).toContain("не менее 2400 знаков");
    expect(instructions).toContain("horizonDays\":7");
    expect(instructions).toContain("Запрещены слова «расклад»");
    expect(instructions).toContain("жизненный смысл");
    expect(instructions).toContain("Что важно сейчас");
    expect(instructions).not.toContain("в тексте claim обязательно назови планету, знак, дом");
  });

  it("final evidence salvage stays behind the substantive gate (fail closed)", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/natal/generate-validated-report.ts"),
      "utf8"
    );
    const finalSalvage = source.match(
      /Absolute fallback for forecasts[\s\S]*?acceptedViaSalvage = true;/
    );
    expect(finalSalvage).not.toBeNull();
    expect(finalSalvage![0]).toContain("isSubstantiveReport(salvaged.report, params)");
  });
});

describe("natal forecast human voice", () => {
  it("timing cards lead with life meaning, not aspect jargon", () => {
    const plain = describeTimingEventPlain({
      kind: "aspect",
      planetKey: "saturn",
      targetKey: "moon",
      aspect: "square",
      category: "emotions",
    });
    expect(plain.headline).toMatch(/трение/);
    expect(plain.headline).toMatch(/чувствах/);
    expect(plain.detail).toMatch(/Сатурн/);
    expect(plain.headline).not.toMatch(/квадрат|орб/i);
  });

  it("forecast salvage speaks like a person, not a textbook", () => {
    const evidence: NatalEvidence[] = [
      {
        id: "ne.timing.saturn-moon",
        tradition: "timing",
        category: "timing",
        type: "transit",
        label: "Сатурн · квадрат · Луна",
        value: "2026-08-21",
        sourcePath: "timing.events.0",
        confidence: "high",
        uncertainty: null,
        deepLink: "",
      },
    ];
    const salvaged = salvageNatalReport({}, evidence, "western", "forecast", 7);
    expect(salvaged.ok).toBe(true);
    if (!salvaged.ok) return;
    const body = salvaged.report.sections.map((section) => section.claims.map((claim) => claim.text).join(" ")).join("\n");
    expect(body).toMatch(/Простыми словами/);
    expect(body).not.toMatch(/задаёт тон окна — держи её как рамку/);
    expect(body).not.toMatch(/практический акцент/i);
    expect(salvaged.report.sections[0]?.title).toBe("Что важно сейчас");
  });
});
