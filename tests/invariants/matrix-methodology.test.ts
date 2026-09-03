import { describe, expect, it } from "vitest";
import {
  classifyMatrixReportVersion,
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  MATRIX_V4_CALCULATION_VERSION,
  MATRIX_V4_METHODOLOGY_ID,
  MATRIX_V5_ENGINE_FINGERPRINT,
  matrixToStructuredData,
  reduceToArcanaDigitSum,
  reduceToArcanaNumber,
  reduceToArcanaSubtract22,
} from "@/lib/numerology/destiny-matrix";
import { getMatrixArcanaEntry } from "@/lib/numerology/matrix-arcana-map";
import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
import {
  hydrateDestinyMatrixFromSnapshot,
  resolveMatrixForDisplay,
  resolveMatrixForDisplayDetailed,
} from "@/lib/numerology/matrix-snapshot";
import { MAJOR_ARCANA } from "@/lib/tarot";
import { MATRIX_GOLDEN_VECTORS } from "./matrix-golden-vectors";
import { MATRIX_V5_GOLDEN_AS_OF, MATRIX_V5_GOLDEN_VECTORS } from "./matrix-golden-vectors-v5";

const AS_OF = { asOfDate: MATRIX_V5_GOLDEN_AS_OF } as const;
const V4 = { calculationVersion: MATRIX_V4_CALCULATION_VERSION } as const;

describe("digit-sum reducer (v4/v5)", () => {
  it("keeps 22 and reduces the published edges", () => {
    const cases: Array<[number, number]> = [
      [22, 22],
      [23, 5],
      [24, 6],
      [29, 11],
      [31, 4],
      [32, 5],
      [36, 9],
      [38, 11],
      [42, 6],
      [44, 8],
      [45, 9],
      [46, 10],
      [48, 12],
      [55, 10],
      [99, 18],
    ];
    for (const [input, expected] of cases) {
      expect(reduceToArcanaDigitSum(input), String(input)).toBe(expected);
      expect(reduceToArcanaNumber(input), String(input)).toBe(expected);
    }
  });

  it("keeps frozen subtract-22 as a different function", () => {
    expect(reduceToArcanaSubtract22(31)).toBe(9);
    expect(reduceToArcanaSubtract22(42)).toBe(20);
    expect(reduceToArcanaNumber(31)).toBe(4);
  });
});

describe("frozen matrix-v4 goldens", () => {
  it("has at least 20 hand-confirmed dates", () => {
    expect(MATRIX_GOLDEN_VECTORS.length).toBeGreaterThanOrEqual(20);
  });

  it("replays frozen v4 without reading expected from the live engine", () => {
    expect(MATRIX_CALCULATION_VERSION).toBe("matrix-v5");
    for (const vector of MATRIX_GOLDEN_VECTORS) {
      const m = destinyMatrix(vector.birthDate, { ...AS_OF, ...V4 });
      expect(m, vector.birthDate).toBeTruthy();
      expect(m!.methodologyId).toBe(MATRIX_V4_METHODOLOGY_ID);
      expect(m!.calculationVersion).toBe("matrix-v4");
      expect(m!.body.number, `${vector.birthDate} A`).toBe(vector.expected.a);
      expect(m!.energy.number, `${vector.birthDate} B`).toBe(vector.expected.b);
      expect(m!.roots.number, `${vector.birthDate} C`).toBe(vector.expected.c);
      expect(m!.karma.number, `${vector.birthDate} G`).toBe(vector.expected.g);
      expect(m!.comfort.number, `${vector.birthDate} X`).toBe(vector.expected.x);
      expect(m!.talents.number, `${vector.birthDate} talents`).toBe(vector.expected.talents);
      expect(m!.relationships.number, `${vector.birthDate} love`).toBe(vector.expected.love);
      expect(m!.money.number, `${vector.birthDate} money`).toBe(vector.expected.money);
      expect(m!.skySpirit.number, `${vector.birthDate} sky`).toBe(vector.expected.sky);
      expect(m!.earthTask.number, `${vector.birthDate} earth`).toBe(vector.expected.earth);
      expect(m!.paternal.number, `${vector.birthDate} paternal`).toBe(vector.expected.paternal);
      expect(m!.maternal.number, `${vector.birthDate} maternal`).toBe(vector.expected.maternal);
      expect(m!.karmicTail[2].number, `${vector.birthDate} tail`).toBe(vector.expected.tailTip);
      expect(m!.purpose.number, `${vector.birthDate} v4 purpose=comfort`).toBe(m!.comfort.number);
    }
  });

  it("v4 today equals the known 1990-08-15 fixture", () => {
    const m = destinyMatrix("1990-08-15", { ...AS_OF, ...V4 })!;
    expect(m.comfort.number).toBe(12);
    expect(m.talents.number).toBe(5);
    expect(m.paternal.number).toBe(7);
  });
});

describe("live matrix-v5 goldens", () => {
  it("has at least 20 hand-confirmed dates", () => {
    expect(MATRIX_V5_GOLDEN_VECTORS.length).toBeGreaterThanOrEqual(20);
  });

  it("matches live v5 without reading expected from the engine", () => {
    expect(MATRIX_CALCULATION_VERSION).toBe("matrix-v5");
    expect(MATRIX_METHODOLOGY_ID).toBe("zovus-matrix-22-v2");
    expect(MATRIX_V5_ENGINE_FINGERPRINT).toContain("purpose=sky+earth");
    for (const vector of MATRIX_V5_GOLDEN_VECTORS) {
      const m = destinyMatrix(vector.birthDate, AS_OF);
      expect(m, vector.birthDate).toBeTruthy();
      expect(m!.methodologyId).toBe(MATRIX_METHODOLOGY_ID);
      expect(m!.calculationVersion).toBe("matrix-v5");
      expect(m!.body.number, `${vector.birthDate} A`).toBe(vector.expected.a);
      expect(m!.energy.number, `${vector.birthDate} B`).toBe(vector.expected.b);
      expect(m!.roots.number, `${vector.birthDate} C`).toBe(vector.expected.c);
      expect(m!.karma.number, `${vector.birthDate} G`).toBe(vector.expected.g);
      expect(m!.comfort.number, `${vector.birthDate} X`).toBe(vector.expected.x);
      expect(m!.talents.number, `${vector.birthDate} talents`).toBe(vector.expected.talents);
      expect(m!.talentsChain?.primary.number, `${vector.birthDate} talent.1`).toBe(
        vector.expected.talentPrimary
      );
      expect(m!.talentsChain?.secondary.number, `${vector.birthDate} talent.2`).toBe(
        vector.expected.talentSecondary
      );
      expect(m!.talentsChain?.tertiary.number, `${vector.birthDate} talent.3`).toBe(
        vector.expected.talentTertiary
      );
      expect(m!.relationships.number, `${vector.birthDate} love`).toBe(vector.expected.love);
      expect(m!.money.number, `${vector.birthDate} money`).toBe(vector.expected.money);
      expect(m!.skySpirit.number, `${vector.birthDate} sky`).toBe(vector.expected.sky);
      expect(m!.earthTask.number, `${vector.birthDate} earth`).toBe(vector.expected.earth);
      expect(m!.paternal.number, `${vector.birthDate} paternal`).toBe(vector.expected.paternal);
      expect(m!.maternal.number, `${vector.birthDate} maternal`).toBe(vector.expected.maternal);
      expect(m!.purpose.number, `${vector.birthDate} personal`).toBe(vector.expected.personal);
      expect(m!.purposeBlock?.personal.number, `${vector.birthDate} purpose.personal`).toBe(
        vector.expected.personal
      );
      expect(m!.purposeBlock?.social.number, `${vector.birthDate} purpose.social`).toBe(
        vector.expected.social
      );
      expect(m!.purposeBlock?.spiritual.number, `${vector.birthDate} purpose.spiritual`).toBe(
        vector.expected.spiritual
      );
      expect(m!.karmicTail[2].number, `${vector.birthDate} tail`).toBe(vector.expected.tailTip);
      expect(m!.yearArcana.number, `${vector.birthDate} year`).toBe(vector.expected.year);
      expect(m!.monthArcana.number, `${vector.birthDate} month`).toBe(vector.expected.month);
      expect(m!.chronologicalAge, `${vector.birthDate} chrono`).toBe(vector.expected.chronological);
      expect(m!.ageModel?.periodStart, `${vector.birthDate} periodStart`).toBe(
        vector.expected.periodStart
      );
      expect(m!.ageModel?.periodEnd, `${vector.birthDate} periodEnd`).toBe(vector.expected.periodEnd);
      expect(m!.ageCurrent.number, `${vector.birthDate} ageEnergy`).toBe(vector.expected.ageEnergy);
      expect(m!.purposeBlock, `${vector.birthDate} purpose block`).toBeTruthy();
    }
    const split = destinyMatrix("1990-08-15", AS_OF)!;
    expect(split.purpose.number).toBe(21);
    expect(split.comfort.number).toBe(12);
  });

  it("does not change birth core when asOf changes", () => {
    const a = destinyMatrix("1990-08-15", { asOfDate: "2020-01-01" })!;
    const b = destinyMatrix("1990-08-15", { asOfDate: "2026-08-18" })!;
    expect(a.comfort.number).toBe(12);
    expect(b.comfort.number).toBe(12);
    expect(a.purpose.number).toBe(b.purpose.number);
    expect(a.talents.number).toBe(b.talents.number);
    expect(a.paternal.number).toBe(b.paternal.number);
    expect(a.yearArcana.number).not.toBe(b.yearArcana.number);
  });

  it("is deterministic", () => {
    const first = destinyMatrix("1984-09-07", AS_OF);
    const second = destinyMatrix("1984-09-07", AS_OF);
    expect(first).toEqual(second);
  });
});

describe("invariants", () => {
  it("every energy is an integer 1..22 and never NaN", () => {
    for (const vector of MATRIX_V5_GOLDEN_VECTORS) {
      const m = destinyMatrix(vector.birthDate, AS_OF)!;
      const numbers = [
        m.body.number, m.energy.number, m.roots.number, m.comfort.number,
        m.purpose.number, m.talents.number, m.relationships.number, m.money.number,
        m.paternal.number, m.maternal.number, m.skySpirit.number,
        m.earthTask.number, ...m.karmicTail.map((p) => p.number),
        ...m.agePoints.map((p) => p.number),
        m.yearArcana.number, m.monthArcana.number,
        m.purposeBlock!.personal.number,
        m.purposeBlock!.social.number,
        m.purposeBlock!.spiritual.number,
        m.talentsChain!.primary.number,
        m.talentsChain!.secondary.number,
        m.talentsChain!.tertiary.number,
      ];
      for (const n of numbers) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(22);
      }
    }
  });

  it("snapshot hydrate reproduces the same v5 numbers", () => {
    const m = destinyMatrix("1990-08-15", AS_OF)!;
    const snap = matrixToStructuredData(m);
    const again = hydrateDestinyMatrixFromSnapshot(snap)!;
    expect(again.comfort.number).toBe(12);
    expect(again.purpose.number).toBe(21);
    expect(again.talents.number).toBe(20);
    expect(again.purposeBlock?.spiritual.number).toBe(9);
    expect(again.yearArcana.number).toBe(m.yearArcana.number);
  });

  it("v3 replay stays on subtract-22 and A+C paternal", () => {
    const v3 = destinyMatrix("1990-08-15", { ...AS_OF, calculationVersion: "matrix-v3" })!;
    expect(v3.calculationVersion).toBe("matrix-v3");
    expect(v3.karma.number).toBe(20);
    expect(v3.comfort.number).toBe(18);
    expect(v3.paternal.number).toBe(reduceToArcanaSubtract22(15 + 19));
  });

  it("refuses to live-recompute v1/v2", () => {
    expect(destinyMatrix("1990-08-15", { calculationVersion: "matrix-v1" })).toBeNull();
    expect(destinyMatrix("1990-08-15", { calculationVersion: "matrix-v2" })).toBeNull();
  });

  it("unknown persisted version fails closed", () => {
    const detailed = resolveMatrixForDisplayDetailed({
      birthDate: "1990-08-15",
      calculationVersion: "matrix-v99",
      createdAt: "2026-08-18",
    });
    expect(detailed).toEqual({ ok: false, error: "unsupported_matrix_version" });
    expect(
      resolveMatrixForDisplay({
        birthDate: "1990-08-15",
        calculationVersion: "matrix-v99",
        createdAt: "2026-08-18",
      })
    ).toBeNull();
  });

  it("reopen prefers snapshot over the live engine", () => {
    const v3 = destinyMatrix("1990-08-15", { ...AS_OF, calculationVersion: "matrix-v3" })!;
    const live = destinyMatrix("1990-08-15", AS_OF)!;
    expect(live.comfort.number).not.toBe(v3.comfort.number);
    const reopened = resolveMatrixForDisplay({
      birthDate: "1990-08-15",
      structuredData: matrixToStructuredData(v3),
      calculationVersion: "matrix-v5",
      createdAt: "2026-08-18",
    })!;
    expect(reopened.comfort.number).toBe(v3.comfort.number);
    expect(reopened.paternal.number).toBe(v3.paternal.number);
  });

  it("reopen without snapshot uses the stored calculation version", () => {
    const v3 = destinyMatrix("1990-08-15", { ...AS_OF, calculationVersion: "matrix-v3" })!;
    const v4 = destinyMatrix("1990-08-15", { ...AS_OF, ...V4 })!;
    const reopenedV3 = resolveMatrixForDisplay({
      birthDate: "1990-08-15",
      calculationVersion: "matrix-v3",
      createdAt: "2026-08-18",
    })!;
    const reopenedV4 = resolveMatrixForDisplay({
      birthDate: "1990-08-15",
      calculationVersion: "matrix-v4",
      createdAt: "2026-08-18",
    })!;
    expect(reopenedV3.comfort.number).toBe(v3.comfort.number);
    expect(reopenedV4.comfort.number).toBe(v4.comfort.number);
    expect(reopenedV4.talents.number).toBe(5);
  });

  it("classifies old reports as outdated but replayable", () => {
    const v4 = classifyMatrixReportVersion({
      calculationVersion: "matrix-v4",
      methodologyId: MATRIX_V4_METHODOLOGY_ID,
      rendererVersion: "matrix-svg-v5",
    });
    expect(v4.currentMethodology).toBe(false);
    expect(v4.outdatedMethodology).toBe(true);
    expect(v4.replayable).toBe(true);
    expect(v4.upgradeAvailable).toBe(true);
  });
});

describe("year forecast age transitions", () => {
  it("marks 34→35, 39→40, 44→45 and stays quiet inside a period", () => {
    const at34 = matrixYearForecast("1991-03-08", new Date(2026, 2, 1))!;
    expect(at34.months.find((m) => m.year === 2026 && m.month === 3)?.ageTransition).toBe(true);
    const at39 = matrixYearForecast("1987-04-30", new Date(2027, 3, 1))!;
    expect(at39.months.find((m) => m.year === 2027 && m.month === 4)?.ageTransition).toBe(true);
    const at44 = matrixYearForecast("1981-01-11", new Date(2026, 0, 1))!;
    expect(at44.months.find((m) => m.year === 2026 && m.month === 1)?.ageTransition).toBe(true);
    const mid = matrixYearForecast("1990-08-15", new Date(2026, 0, 1))!;
    expect(mid.months.find((m) => m.year === 2026 && m.month === 3)?.ageTransition).toBeUndefined();
  });
});

describe("matrix arcana map vs tarot deck", () => {
  it("uses 8 Justice / 11 Strength for v4 and v5, RW for v3", () => {
    expect(getMatrixArcanaEntry(8, "matrix-v5")?.title).toBe("Справедливость");
    expect(getMatrixArcanaEntry(11, "matrix-v5")?.title).toBe("Сила");
    expect(getMatrixArcanaEntry(8, "matrix-v4")?.title).toBe("Справедливость");
    expect(getMatrixArcanaEntry(11, "matrix-v4")?.title).toBe("Сила");
    expect(getMatrixArcanaEntry(8, "matrix-v3")?.title).toBe("Сила");
    expect(getMatrixArcanaEntry(11, "matrix-v3")?.title).toBe("Справедливость");
    expect(MAJOR_ARCANA.find((c) => c.id === 8)?.name).toBe("Сила");
    expect(MAJOR_ARCANA.find((c) => c.id === 11)?.name).toBe("Справедливость");
  });
});
