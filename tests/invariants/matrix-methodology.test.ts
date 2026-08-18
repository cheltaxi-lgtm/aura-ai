import { describe, expect, it } from "vitest";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  matrixToStructuredData,
  reduceToArcanaDigitSum,
  reduceToArcanaNumber,
  reduceToArcanaSubtract22,
} from "@/lib/numerology/destiny-matrix";
import { getMatrixArcanaEntry } from "@/lib/numerology/matrix-arcana-map";
import {
  hydrateDestinyMatrixFromSnapshot,
  resolveMatrixForDisplay,
} from "@/lib/numerology/matrix-snapshot";
import { MAJOR_ARCANA } from "@/lib/tarot";
import { MATRIX_GOLDEN_VECTORS } from "./matrix-golden-vectors";

const AS_OF = { asOfDate: "2026-08-18" } as const;

describe("zovus-matrix-22-v1 reducer", () => {
  it("uses digit-sum and keeps 22", () => {
    const cases: Array<[number, number]> = [
      [22, 22],
      [23, 5],
      [24, 6],
      [29, 11],
      [31, 4],
      [32, 5],
      [36, 9],
      [44, 8],
      [45, 9],
      [46, 10],
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

describe("golden vectors", () => {
  it("has at least 20 hand-confirmed dates", () => {
    expect(MATRIX_GOLDEN_VECTORS.length).toBeGreaterThanOrEqual(20);
  });

  it("matches live matrix-v4 without reading expected from the engine", () => {
    expect(MATRIX_CALCULATION_VERSION).toBe("matrix-v4");
    for (const vector of MATRIX_GOLDEN_VECTORS) {
      const m = destinyMatrix(vector.birthDate, AS_OF);
      expect(m, vector.birthDate).toBeTruthy();
      expect(m!.methodologyId).toBe(MATRIX_METHODOLOGY_ID);
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
    }
  });

  it("does not change birth core when asOf changes", () => {
    const a = destinyMatrix("1990-08-15", { asOfDate: "2020-01-01" })!;
    const b = destinyMatrix("1990-08-15", { asOfDate: "2026-08-18" })!;
    expect(a.comfort.number).toBe(12);
    expect(b.comfort.number).toBe(12);
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
    for (const vector of MATRIX_GOLDEN_VECTORS) {
      const m = destinyMatrix(vector.birthDate, AS_OF)!;
      const numbers = [
        m.body.number, m.energy.number, m.roots.number, m.comfort.number,
        m.talents.number, m.relationships.number, m.money.number,
        m.paternal.number, m.maternal.number, m.skySpirit.number,
        m.earthTask.number, ...m.karmicTail.map((p) => p.number),
        ...m.agePoints.map((p) => p.number),
        m.yearArcana.number, m.monthArcana.number,
      ];
      for (const n of numbers) {
        expect(Number.isInteger(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(22);
      }
    }
  });

  it("snapshot hydrate reproduces the same numbers", () => {
    const m = destinyMatrix("1990-08-15", AS_OF)!;
    const snap = matrixToStructuredData(m);
    const again = hydrateDestinyMatrixFromSnapshot(snap)!;
    expect(again.comfort.number).toBe(12);
    expect(again.talents.number).toBe(5);
    expect(again.paternal.number).toBe(7);
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

  it("reopen prefers snapshot over the live engine", () => {
    const v3 = destinyMatrix("1990-08-15", { ...AS_OF, calculationVersion: "matrix-v3" })!;
    const live = destinyMatrix("1990-08-15", AS_OF)!;
    expect(live.comfort.number).not.toBe(v3.comfort.number);
    const reopened = resolveMatrixForDisplay({
      birthDate: "1990-08-15",
      structuredData: matrixToStructuredData(v3),
      calculationVersion: "matrix-v4",
      createdAt: "2026-08-18",
    })!;
    expect(reopened.comfort.number).toBe(v3.comfort.number);
    expect(reopened.paternal.number).toBe(v3.paternal.number);
  });

  it("reopen without snapshot uses the stored calculation version", () => {
    const v3 = destinyMatrix("1990-08-15", { ...AS_OF, calculationVersion: "matrix-v3" })!;
    const reopened = resolveMatrixForDisplay({
      birthDate: "1990-08-15",
      calculationVersion: "matrix-v3",
      createdAt: "2026-08-18",
    })!;
    expect(reopened.comfort.number).toBe(v3.comfort.number);
    expect(reopened.paternal.number).toBe(v3.paternal.number);
  });
});

describe("matrix arcana map vs tarot deck", () => {
  it("uses 8 Justice / 11 Strength for matrix-v4 only", () => {
    expect(getMatrixArcanaEntry(8, "matrix-v4")?.title).toBe("Справедливость");
    expect(getMatrixArcanaEntry(11, "matrix-v4")?.title).toBe("Сила");
    expect(getMatrixArcanaEntry(8, "matrix-v3")?.title).toBe("Сила");
    expect(getMatrixArcanaEntry(11, "matrix-v3")?.title).toBe("Справедливость");
    expect(MAJOR_ARCANA.find((c) => c.id === 8)?.name).toBe("Сила");
    expect(MAJOR_ARCANA.find((c) => c.id === 11)?.name).toBe("Справедливость");
  });
});
