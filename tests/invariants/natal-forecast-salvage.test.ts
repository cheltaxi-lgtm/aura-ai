import { describe, expect, it } from "vitest";
import type { NatalEvidence } from "@/lib/natal/evidence";
import {
  NATAL_REPORT_SECTION_KEYS,
  NATAL_REPORT_VERSION,
  salvageNatalReport,
  validateNatalReport,
} from "@/lib/natal/report";

// Citation repair may fix spelling but must never invent unrelated evidence.
const WESTERN: NatalEvidence = {
  id: "ne.western.sun_leo",
  tradition: "western",
  category: "identity",
  type: "position",
  label: "Солнце во Льве",
  value: "Солнце в знаке Льва в натальной карте",
  sourcePath: "natal.positions.sun",
  confidence: "high",
  uncertainty: null,
  deepLink: "/cabinet/astrology",
};

const TIMING: NatalEvidence = {
  id: "ne.timing.transit_mars_square",
  tradition: "timing",
  category: "timing",
  type: "transit",
  label: "Транзитный Марс в квадрате",
  value: "Пиковый период 12–18 августа",
  sourcePath: "timing.transits.mars",
  confidence: "medium",
  uncertainty: "Влияние вероятностное.",
  deepLink: "/cabinet/astrology?tab=timing",
};

const LONG_TEXT =
  "Транзитный фактор задаёт основную тему периода: энергия концентрируется " +
  "вокруг конкретных решений и требует внимательного отношения к срокам. " +
  "Сверяйте ощущения с пиковыми датами в шкале транзитов и фиксируйте, что " +
  "подтверждается опытом, а что остаётся фоном.";

function forecastCandidate(evidenceId: string) {
  return {
    version: NATAL_REPORT_VERSION,
    tradition: "western",
    reportType: "forecast",
    horizonDays: 30,
    sections: NATAL_REPORT_SECTION_KEYS.map((key) => ({
      key,
      title: `Раздел ${key}`,
      claims: [{ text: LONG_TEXT, evidenceIds: [evidenceId] }],
    })),
    disclaimer: "Символическая интерпретация.",
    methodology: "Выводы привязаны к evidence.",
  };
}

describe("natal forecast salvage — timing citation coercion", () => {
  it("rejects timing sections supported only by natal IDs", () => {
    const candidate = forecastCandidate(WESTERN.id);
    const salvaged = salvageNatalReport(
      candidate,
      [WESTERN, TIMING],
      "western",
      "forecast",
      30
    );
    expect(salvaged.ok).toBe(false);
    if (salvaged.ok) {
      for (const key of ["summary", "currentPeriod", "recommendations"] as const) {
        const section = salvaged.report.sections.find((s) => s.key === key);
        expect(
          section?.claims.some((c) => c.evidenceIds.includes(TIMING.id))
        ).toBe(true);
      }
    }
  });

  it("coerce-mode validation passes for the same candidate", () => {
    const candidate = forecastCandidate(WESTERN.id);
    const validation = validateNatalReport(
      candidate,
      [WESTERN, TIMING],
      "western",
      "forecast",
      30,
      { coerceEvidence: true, skipCategoryRules: true }
    );
    expect(validation.ok).toBe(true);
  });

  it("still fails closed when the evidence pool has no timing items", () => {
    const candidate = forecastCandidate(WESTERN.id);
    const salvaged = salvageNatalReport(
      candidate,
      [WESTERN],
      "western",
      "forecast",
      30
    );
    expect(salvaged.ok).toBe(false);
  });

  it("preserves all prose and citations when they already support the section", () => {
    const candidate = forecastCandidate(WESTERN.id);
    for (const section of candidate.sections) {
      if (["summary", "currentPeriod", "recommendations"].includes(section.key)) section.claims[0].evidenceIds = [TIMING.id];
    }
    const salvaged = salvageNatalReport(
      candidate,
      [WESTERN, TIMING],
      "western",
      "forecast",
      30
    );
    expect(salvaged.ok).toBe(true);
    if (salvaged.ok) {
      expect(salvaged.report.sections.map(s => s.claims[0].text)).toEqual(candidate.sections.map(s => s.claims[0].text));
      const personality = salvaged.report.sections.find((s) => s.key === "personality");
      expect(
        personality?.claims.every((c) => !c.evidenceIds.includes(TIMING.id))
      ).toBe(true);
    }
  });
});
