import { describe, expect, it } from "vitest";
import type { NatalEvidence } from "@/lib/natal/evidence";
import {
  NATAL_REPORT_SECTION_KEYS,
  NATAL_REPORT_VERSION,
  buildNatalReportJsonInstructions,
  salvageNatalReport,
} from "@/lib/natal/report";
import {
  claimHasEvidenceAnchor,
  claimTextSimilarity,
  findNearDuplicateSections,
  natalSectionRoleSubtitle,
  SECTION_ROLE_CONTRACTS,
} from "@/lib/natal/report-quality";

const TIMING: NatalEvidence = {
  id: "ne.timing.transit_mars_square",
  tradition: "timing",
  category: "career",
  type: "transit",
  label: "Транзитный Марс в квадрате",
  value: "Пиковый период 12–18 августа",
  sourcePath: "timing.transits.mars",
  confidence: "medium",
  uncertainty: null,
  deepLink: "/cabinet/astrology?tab=timing",
};

const WESTERN: NatalEvidence = {
  id: "ne.western.sun_leo",
  tradition: "western",
  category: "identity",
  type: "position",
  label: "Солнце во Льве",
  value: "Солнце в знаке Льва",
  sourcePath: "natal.positions.sun",
  confidence: "high",
  uncertainty: null,
  deepLink: "/cabinet/astrology",
};

const SAME =
  "Транзитный фактор задаёт основную тему периода: энергия концентрируется " +
  "вокруг конкретных решений и требует внимательного отношения к срокам. " +
  "Сверяйте ощущения с пиковыми датами в шкале транзитов и фиксируйте, что " +
  "подтверждается опытом, а что остаётся фоном. Дополнительная вода для длины.";

describe("natal report quality contracts", () => {
  it("prompt defines distinct roles for summary / period / recommendations", () => {
    const instructions = buildNatalReportJsonInstructions("western", "forecast", 30);
    expect(instructions).toContain(SECTION_ROLE_CONTRACTS.summary.slice(0, 40));
    expect(instructions).toContain(SECTION_ROLE_CONTRACTS.recommendations.slice(0, 40));
    expect(instructions).toContain("summary ≠ recommendations");
    expect(instructions).toContain("убери воду");
  });

  it("UI role subtitles exist for all section keys", () => {
    for (const key of NATAL_REPORT_SECTION_KEYS) {
      expect(natalSectionRoleSubtitle(key)).toBeTruthy();
    }
  });

  it("detects near-duplicate summary vs recommendations", () => {
    const report = {
      sections: NATAL_REPORT_SECTION_KEYS.map((key) => ({
        key,
        claims: [{ text: SAME }],
      })),
    };
    const dupes = findNearDuplicateSections(report);
    expect(dupes.some((d) => d.a === "summary" && d.b === "recommendations")).toBe(true);
    expect(claimTextSimilarity(SAME, SAME)).toBeGreaterThan(0.9);
  });

  it("claim anchor requires named calculation fragment", () => {
    expect(
      claimHasEvidenceAnchor("Марс в квадрате усиливает давление в работе.", [TIMING])
    ).toBe(true);
    expect(
      claimHasEvidenceAnchor("Возможны изменения и у тебя есть потенциал.", [TIMING])
    ).toBe(false);
    expect(claimHasEvidenceAnchor("Солнце во Льве даёт яркий стиль.", [WESTERN])).toBe(true);
  });

  it("salvage splits identical timing-trio prose into role-specific texts", () => {
    const candidate = {
      version: NATAL_REPORT_VERSION,
      tradition: "western",
      reportType: "forecast",
      horizonDays: 30,
      sections: NATAL_REPORT_SECTION_KEYS.map((key) => ({
        key,
        title: `Раздел ${key}`,
        claims: [{ text: SAME, evidenceIds: [TIMING.id] }],
      })),
      disclaimer: "Символическая интерпретация.",
      methodology: "Выводы привязаны к evidence.",
    };
    const salvaged = salvageNatalReport(
      candidate,
      [WESTERN, TIMING],
      "western",
      "forecast",
      30
    );
    expect(salvaged.ok).toBe(true);
    if (!salvaged.ok) return;
    const summary = salvaged.report.sections.find((s) => s.key === "summary")?.claims[0]?.text ?? "";
    const recs =
      salvaged.report.sections.find((s) => s.key === "recommendations")?.claims[0]?.text ?? "";
    const period =
      salvaged.report.sections.find((s) => s.key === "currentPeriod")?.claims[0]?.text ?? "";
    expect(claimTextSimilarity(summary, recs)).toBeLessThan(0.68);
    expect(claimTextSimilarity(summary, period)).toBeLessThan(0.68);
    expect(summary.toLowerCase()).toContain("марс");
    expect(recs.toLowerCase()).toMatch(/сделай|действие|шаг/);
    expect(findNearDuplicateSections(salvaged.report)).toHaveLength(0);
  });
});
