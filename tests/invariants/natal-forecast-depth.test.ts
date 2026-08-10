import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNatalReportJsonInstructions } from "@/lib/natal/report";

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
