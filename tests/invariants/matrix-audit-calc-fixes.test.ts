import { describe, expect, it } from "vitest";
import { destinyMatrix, formatDestinyMatrixAscii, matrixToStructuredData } from "@/lib/numerology/destiny-matrix";
import { hydrateDestinyMatrixFromSnapshot, resolveMatrixForDisplayDetailed, resolveMatrixForEngine } from "@/lib/numerology/matrix-snapshot";
import { buildMatrixSemanticModel } from "@/lib/numerology/matrix-semantic-model";
import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
import { matrixCompatibility } from "@/lib/numerology/matrix-compatibility";
import { reduceToArcanaSubtract22 } from "@/lib/numerology/matrix-reducers";

const DOB = "1990-08-15";
const AS_OF = "2026-09-30";
const snapshot = () => matrixToStructuredData(destinyMatrix(DOB, { asOfDate: AS_OF })!);

describe("Matrix audit calculation fixes", () => {
  it("binds newly stored snapshots even when two births share the same numeric matrix", () => {
    const matrix = destinyMatrix("1990-08-04", { asOfDate: AS_OF })!;
    const data = matrixToStructuredData(matrix, "1990-08-04");
    expect(resolveMatrixForEngine({ birthDate: "1990-08-04", snapshot: data })).not.toBeNull();
    expect(resolveMatrixForEngine({ birthDate: "1990-08-31", snapshot: data })).toBeNull();
  });
  it.each(["matrix-v3", "matrix-v4", "matrix-v5"])("rejects invalid explicit calendars without replacing them with today: %s", calculationVersion => {
    for (const options of [{ asOfDate: "2026-02-30" }, { asOfDate: "" }, { asOfMonth: 99 }, { asOfYear: NaN }, { asOfDate: AS_OF, asOfYear: 2025 }]) {
      expect(destinyMatrix(DOB, { ...options, calculationVersion })).toBeNull();
    }
    expect(destinyMatrix(DOB, { asOfDate: "2099-12-31", calculationVersion })?.asOf.date).toBe("2099-12-31");
  });
  it("requires v5 purpose and its complete block", () => {
    const data = snapshot(); delete data.purpose; delete data.purposeBlock;
    expect(hydrateDestinyMatrixFromSnapshot(data)).toBeNull();
    expect(resolveMatrixForDisplayDetailed({ birthDate: DOB, structuredData: data })).toEqual({ ok: false, error: "invalid_matrix_snapshot" });
  });
  it.each(["matrix-v3", "matrix-v4", "matrix-v5"])("preserves valid frozen snapshots and binds them to birth: %s", calculationVersion => {
    const matrix = destinyMatrix(DOB, { asOfDate: AS_OF, calculationVersion })!;
    const data = matrixToStructuredData(matrix);
    const restored = resolveMatrixForEngine({ birthDate: DOB, snapshot: data, asOfDate: "2099-12-31" })!;
    expect(restored.calculationVersion).toBe(matrix.calculationVersion);
    expect(restored.asOf).toEqual(matrix.asOf);
    expect(restored.purpose).toEqual(matrix.purpose);
    expect(restored.ageCurrent).toEqual(matrix.ageCurrent);
    expect(restored.chronologicalAge).toBe(matrix.chronologicalAge);
    expect(resolveMatrixForEngine({ birthDate: "1988-03-03", snapshot: data })).toBeNull();
    expect(resolveMatrixForDisplayDetailed({ birthDate: "1988-03-03", structuredData: data }).ok).toBe(false);
    expect(resolveMatrixForEngine({ birthDate: DOB, snapshot: { ...data, birthDate: "1988-03-03" } })).toBeNull();
  });
  it("rejects calendar, age and period corruption", () => {
    for (const change of [{ asOf: { year: 2026, month: 99, date: AS_OF } }, { asOf: { year: 2026, month: 2, date: "2026-02-30" } }, { chronologicalAge: -1 }, { ageCurrent: { ...snapshot().ageCurrent as object, age: -5 } }, { ageNext: { ...snapshot().ageNext as object, age: 60 } }, { ageModel: { ...snapshot().ageModel as object, periodStart: -5 } }]) {
      expect(hydrateDestinyMatrixFromSnapshot({ ...snapshot(), ...change })).toBeNull();
    }
  });
  it("uses the open final 80+ period and highlights its existing boundary", () => {
    const matrix = destinyMatrix("1940-01-01", { asOfDate: AS_OF })!;
    expect(matrix.chronologicalAge).toBe(86);
    expect(matrix.ageCurrent.age).toBe(80);
    expect(matrix.ageNext).toBeNull();
    expect(matrix.ageModel?.periodEnd).toBe(80);
    expect(formatDestinyMatrixAscii(matrix)).toContain("период 80+");
    expect(buildMatrixSemanticModel(matrix).ageMarks.find(p => p.age === 80)?.current).toBe(true);
    expect(hydrateDestinyMatrixFromSnapshot(matrixToStructuredData(matrix))).not.toBeNull();
  });
  it("starts forecast on the actual requested day after a birthday", () => {
    const result = matrixYearForecast(DOB, new Date("2025-08-20T12:00:00Z"))!;
    expect(result.matrix.asOf.date).toBe("2025-08-20");
    expect(result.matrix.chronologicalAge).toBe(35);
    expect(result.matrix.ageCurrent.age).toBe(35);
  });
  it.each(["matrix-v3", "matrix-v4"])("keeps purchased %s throughout a historical yearly forecast", calculationVersion => {
    const result = matrixYearForecast(DOB, new Date("2025-08-20T12:00:00Z"), calculationVersion)!;
    expect(result.matrix.calculationVersion).toBe(calculationVersion);
    expect(result.matrix.asOf.date).toBe("2025-08-20");
    expect(result.matrix.talents.number).toBe(calculationVersion === "matrix-v4" ? 5 : 1);
    for (const month of result.months) {
      const frozen = destinyMatrix(DOB, { calculationVersion, asOfYear: month.year, asOfMonth: month.month, asOfDate: `${month.year}-${String(month.month).padStart(2, "0")}-01` })!;
      expect(month.number).toBe(frozen.monthArcana.number);
    }
  });
  it("uses the frozen v3 reducer for pair derived energies", () => {
    const pair = matrixCompatibility(DOB, "1988-03-03", { asOfDate: AS_OF, calculationVersion: "matrix-v3" })!;
    expect(pair.pairComfort).toBe(reduceToArcanaSubtract22(pair.matrixA.comfort.number + pair.matrixB.comfort.number));
    expect(pair.pairYear).toBe(reduceToArcanaSubtract22(pair.matrixA.yearArcana.number + pair.matrixB.yearArcana.number));
  });
});
