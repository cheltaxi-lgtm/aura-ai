import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateHdChart } from "@/lib/human-design/calculate";
import { crossAngleFromProfile, TYPE_META } from "@/lib/human-design/constants";
import { normalizeHdTimezone } from "@/lib/human-design/fingerprint";
import { buildHdLockedContract } from "@/lib/hd-report-pipeline/contract";
import {
  expectedHdSectionalLlmCalls,
  HD_PIPELINE_BATCHES,
  HD_PIPELINE_SECTIONS,
} from "@/lib/hd-report-pipeline/sections";
import { hdReportRequiresNewCharge } from "@/lib/hd-report-pipeline/billing";
import { sanitizeHdGeneratedText } from "@/lib/hd-report-pipeline/generate";
import { validateHdReportText } from "@/lib/hd-report-quality/validator";

const FIXTURE = readFileSync(
  join(process.cwd(), "scripts/fixtures/hd-pro-defect-zp_xVc.md"),
  "utf8"
);

const SVETLANA = {
  birthDate: "1987-04-03",
  birthTime: "14:00",
  timezone: "Asia/Yekaterinburg",
} as const;

describe("HD report quality gate", () => {
  it("1. defective fixture fails V1–V5 and extended rules", () => {
    const chart = calculateHdChart(SVETLANA);
    const contract = buildHdLockedContract(chart);
    const q = validateHdReportText(FIXTURE, {
      engineTypeRu: contract.typeRu,
      motorCount: contract.motorCentersDefinedRu.length,
      contract,
      requireFocusAnswer: true,
    });
    expect(q.ok).toBe(false);
    const rules = new Set(q.findings.map((f) => f.rule));
    expect(rules.has("V1")).toBe(true);
    expect(rules.has("V2")).toBe(true);
    expect(rules.has("V3")).toBe(true);
    expect(rules.has("V4")).toBe(true);
    expect(rules.has("V5")).toBe(true);
  });

  it("2. Svetlana engine type is locked into prompt contract", () => {
    const chart = calculateHdChart(SVETLANA);
    const contract = buildHdLockedContract(chart);
    expect(chart.type).toBe("manifestor");
    expect(contract.typeRu).toBe(TYPE_META.manifestor.nameRu);
    expect(contract.contractBlock).toContain(`Тип = ${contract.typeRu}`);
    expect(contract.crossAngleRu).toBeTruthy();
    expect(contract.hangingGateNumbers.length).toBeGreaterThan(0);
  });

  it("3. wrong type assertion fails V4", () => {
    const chart = calculateHdChart(SVETLANA);
    const typeRu = TYPE_META[chart.type].nameRu;
    const bad = validateHdReportText(`Вы — Проектор. ${"механика ".repeat(200)}`, {
      engineTypeRu: typeRu,
      motorCount: 1,
      requireFocusAnswer: false,
    });
    expect(bad.findings.some((f) => f.detail.includes("wrong_type_asserted"))).toBe(true);
  });

  it("4. duplicate section titles fail V2", () => {
    const body = [
      "## Тип и его особенности",
      "a ".repeat(100),
      "## Тип и его особенности",
      "b ".repeat(100),
      "## Стратегия",
      "c ".repeat(100),
    ].join("\n");
    const q = validateHdReportText(body, {
      engineTypeRu: "Манифестор",
      requireFocusAnswer: false,
    });
    expect(q.findings.some((f) => f.detail.startsWith("duplicate_title:"))).toBe(true);
  });

  it("5–6. meta and sleep blocked", () => {
    expect(
      validateHdReportText(
        "Продолжаю полный разбор строго по недостающим разделам. " + "слово ".repeat(900),
        { engineTypeRu: "Манифестор", requireFocusAnswer: false }
      ).findings.some((f) => f.rule === "V1")
    ).toBe(true);
    expect(
      validateHdReportText(
        "Режим: 4-5 часов ночью + короткий отдых. " + "слово ".repeat(900),
        { engineTypeRu: "Манифестор", requireFocusAnswer: false }
      ).findings.some((f) => f.rule === "V3")
    ).toBe(true);
  });

  it("7. technical junk blocked", () => {
    expect(
      validateHdReportText(
        "Разбор оборвался: Timed out while waiting. " + "слово ".repeat(900),
        { engineTypeRu: "Манифестор", requireFocusAnswer: false }
      ).findings.some((f) => f.rule === "V5")
    ).toBe(true);
  });

  it("7b. plain HD disclaimer does not trip V5 (markdown italics did)", () => {
    const italic =
      "слово ".repeat(900) +
      "\n\n---\n*Разбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.*";
    const plain =
      "слово ".repeat(900) +
      "\n\n---\nРазбор является символической интерпретацией системы Дизайна Человека и не заменяет профессиональную консультацию.";
    expect(
      validateHdReportText(italic, {
        engineTypeRu: "Манифестор",
        requireFocusAnswer: false,
      }).findings.some((f) => f.rule === "V5")
    ).toBe(true);
    expect(
      validateHdReportText(plain, {
        engineTypeRu: "Манифестор",
        requireFocusAnswer: false,
      }).findings.some((f) => f.rule === "V5")
    ).toBe(false);
  });

  it("8. needs_regeneration resume does not require a new rune charge", () => {
    expect(
      hdReportRequiresNewCharge({
        status: "needs_regeneration",
        transactionId: "txn-held",
      })
    ).toBe(false);
  });

  it("9. batch call budget ≤ 15", () => {
    expect(expectedHdSectionalLlmCalls()).toBeLessThanOrEqual(15);
    expect(HD_PIPELINE_BATCHES.length + 1).toBe(expectedHdSectionalLlmCalls());
    expect(HD_PIPELINE_SECTIONS).toContain("Ответ на ваш запрос");
  });

  it("V9 contrast/negation does not false-positive on Manifestor", () => {
    const chart = calculateHdChart(SVETLANA);
    const contract = buildHdLockedContract(chart);
    expect(chart.type).toBe("manifestor");
    const pad = "механика ".repeat(200);
    const contrastBodies = [
      `Вы — Манифестор. Вам не нужно ждать приглашения. ${pad}`,
      `Вы — Манифестор. Не ждите приглашения, как Проектор. ${pad}`,
      `Вы — Манифестор. В отличие от Проектора (ждать приглашения) вы информируете. ${pad}`,
      `Вы — Манифестор. Стратегия Проектора — ждать приглашения; ваша — информировать. ${pad}`,
      `Вы — Манифестор. У вас не два моторных центра, а ${contract.motorCentersDefinedRu.length}. ${pad}`,
    ];
    for (const body of contrastBodies) {
      const q = validateHdReportText(body, {
        engineTypeRu: contract.typeRu,
        motorCount: contract.motorCentersDefinedRu.length,
        contract,
        requireFocusAnswer: false,
      });
      expect(q.findings.some((f) => f.rule === "V9")).toBe(false);
      expect(
        q.findings.some((f) => f.detail.startsWith("wrong_motor_count_claimed:"))
      ).toBe(false);
    }
    const affirmative = validateHdReportText(
      `Вы — Манифестор. Ждите приглашения перед каждым шагом. ${pad}`,
      {
        engineTypeRu: contract.typeRu,
        motorCount: contract.motorCentersDefinedRu.length,
        contract,
        requireFocusAnswer: false,
      }
    );
    expect(affirmative.findings.some((f) => f.rule === "V9")).toBe(true);

    // «как у Проектора: ждите…» is bad advice, not contrast.
    const fakeContrast = validateHdReportText(
      `Вы — Манифестор. Делайте как у Проектора: ждите приглашения. ${pad}`,
      {
        engineTypeRu: contract.typeRu,
        motorCount: contract.motorCentersDefinedRu.length,
        contract,
        requireFocusAnswer: false,
      }
    );
    expect(fakeContrast.findings.some((f) => f.rule === "V9")).toBe(true);
  });

  it("V7–V12: foreign strategy, age, escaped md, missing answer", () => {
    const chart = calculateHdChart(SVETLANA);
    const contract = buildHdLockedContract(chart);
    // Inject a cross angle that is foreign to this chart's contract.
    const wrongAngle =
      contract.crossAngleKey === "left" ? "Прямой угол" : "Левый угол";
    const body = [
      `Вы — ${contract.typeRu}. Крест: ${wrongAngle}.`,
      "Ждите приглашения вместо непрошеных диагнозов.",
      "В 30 лет ворота 26 дадут кризис.",
      "1\\. пункт",
      "\\- список",
      "[редакция: сняты медицинские формулировки]",
      "## Периоды и темы жизни",
      "текст ".repeat(80),
    ].join("\n");
    const q = validateHdReportText(body, {
      engineTypeRu: contract.typeRu,
      motorCount: contract.motorCentersDefinedRu.length,
      contract,
      requireFocusAnswer: true,
    });
    const rules = new Set(q.findings.map((f) => f.rule));
    expect(rules.has("V7")).toBe(true);
    expect(rules.has("V9")).toBe(true);
    expect(rules.has("V10")).toBe(true);
    expect(rules.has("V11")).toBe(true);
    expect(rules.has("V12")).toBe(true);
    expect(rules.has("V6")).toBe(true); // missing focus answer
  });

  it("10. sanitize strips fence wrap, meta preamble, invented headings, trailing escapes", () => {
    const dirty = [
      "Вот полный разбор вашей карты в формате markdown:",
      "```",
      "## Светлана, ваша карта Дизайна Человека",
      "## Тип и его особенности",
      "Вы — Манифестор. " + "текст ".repeat(60),
      "## Стратегия",
      "Информировать перед действием. " + "текст ".repeat(60),
      "\\*",
      "```",
    ].join("\n");
    const clean = sanitizeHdGeneratedText(dirty);
    expect(clean).not.toContain("```");
    expect(clean).not.toContain("Вот полный разбор");
    expect(clean).not.toContain("Светлана, ваша карта");
    expect(clean).not.toMatch(/\\?[*_]\s*$/);
    expect(clean).toContain("## Тип и его особенности");
    expect(clean).toContain("## Стратегия");
    // Clean text no longer trips V5 (fence junk) on the same body.
    const q = validateHdReportText(clean, {
      engineTypeRu: "Манифестор",
      requireFocusAnswer: false,
    });
    expect(q.findings.some((f) => f.rule === "V5")).toBe(false);
  });
});

describe("crossAngleFromProfile: profile → cross angle", () => {
  const EXPECTED: Record<string, string> = {
    "1/3": "right",
    "1/4": "right",
    "2/4": "right",
    "2/5": "right",
    "3/5": "right",
    "3/6": "right",
    "4/6": "right", // fixed: was "left" (bug)
    "4/1": "juxtaposition", // school choice kept as-is (juxtaposition)
    "5/1": "left",
    "5/2": "left",
    "6/2": "left",
    "6/3": "left",
  };

  it("all 12 profiles map to the correct angle", () => {
    for (const [profile, angle] of Object.entries(EXPECTED)) {
      expect(crossAngleFromProfile(profile), `profile ${profile}`).toBe(angle);
    }
  });

  it("Svetlana 4/6 is now right angle", () => {
    const chart = calculateHdChart(SVETLANA);
    expect(chart.profile).toBe("4/6");
    expect(chart.cross.angle).toBe("right");
  });
});

describe("normalizeHdTimezone / canonical chart.timezone", () => {
  it("canonical IANA is persisted for RU cities", () => {
    expect(
      calculateHdChart({
        birthDate: "1990-06-15",
        birthTime: "12:00",
        timezone: "Asia/Yekaterinburg",
      }).timezone
    ).toBe("Asia/Yekaterinburg");
    expect(
      calculateHdChart({
        birthDate: "1990-06-15",
        birthTime: "12:00",
        timezone: "Europe/Kaliningrad",
      }).timezone
    ).toBe("Europe/Kaliningrad");
    expect(
      calculateHdChart({
        birthDate: "1990-06-15",
        birthTime: "12:00",
        timezone: "Asia/Vladivostok",
      }).timezone
    ).toBe("Asia/Vladivostok");
  });

  it("non-canonical casing is normalized to canonical IANA", () => {
    expect(normalizeHdTimezone("asia/yekaterinburg")).toBe("Asia/Yekaterinburg");
    expect(
      calculateHdChart({
        birthDate: "1990-06-15",
        birthTime: "12:00",
        timezone: "asia/yekaterinburg",
      }).timezone
    ).toBe("Asia/Yekaterinburg");
  });
});
