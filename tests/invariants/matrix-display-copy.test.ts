import { describe, expect, it } from "vitest";
import { formatAgeAndPeriodFocus, formatMatrixAge } from "@/lib/numerology/matrix-labels";
import { buildMatrixFreeSummary } from "@/lib/numerology/matrix-free-summary";
import { formatDestinyMatrixAscii } from "@/lib/numerology/destiny-matrix";

describe("Matrix display copy", () => {
  it.each([[0, "0 лет"], [1, "1 год"], [2, "2 года"], [5, "5 лет"], [11, "11 лет"], [12, "12 лет"], [14, "14 лет"], [21, "21 год"], [31, "31 год"], [32, "32 года"], [111, "111 лет"]])("formats age %s", (age, label) => {
    expect(formatMatrixAge(Number(age))).toBe(label);
  });

  it("uses the same age wording in summary, report and text export", () => {
    const summary = buildMatrixFreeSummary("1995-04-17", { asOfDate: "2026-10-01" })!;
    expect(summary.denseTeaser).toContain("31 год · период 30–35");
    expect(summary.ageInsight).toContain("31 год.");
    expect(formatDestinyMatrixAscii(summary.matrix)).toContain("31 год · период");
    expect(formatAgeAndPeriodFocus({ chronological: 22, periodStart: 20, periodEnd: 25 })).toContain("22 года.");
    expect(summary.portrait).not.toContain("..");
    expect(summary.portrait).toContain("восстановление. Комфорт:");
  });
});
