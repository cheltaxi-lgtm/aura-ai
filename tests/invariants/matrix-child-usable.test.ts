/**
 * Child matrix reports use a different required zone set than adult destiny_matrix.
 * The client-safety gate must honor toolId or paid child reports never save.
 */
import { describe, expect, it } from "vitest";
import { isUsableMatrixReading } from "@/lib/chat-reply-sanitize";
import { destinyMatrix } from "@/lib/numerology/destiny-matrix";
import {
  isCompleteMatrixReading,
  matrixMissingSections,
} from "@/lib/numerology/matrix-completeness";
import { forceFillMissingSections } from "@/lib/numerology/matrix-sectioned-reading";

const CHILD_DATE = "2015-03-12";
const ADULT_DATE = "1990-07-21";

describe("matrix child vs adult usability gate", () => {
  it("engine-filled child matrix is usable only with child_matrix toolId", () => {
    const matrix = destinyMatrix(CHILD_DATE);
    expect(matrix).toBeTruthy();
    const filled = forceFillMissingSections(
      "",
      matrix!,
      "Анна",
      "female",
      "child_matrix"
    );
    expect(matrixMissingSections(filled, "child_matrix")).toEqual([]);
    expect(isCompleteMatrixReading(filled, "child_matrix")).toBe(true);
    expect(isUsableMatrixReading(filled, "child_matrix")).toBe(true);
    expect(isUsableMatrixReading(filled)).toBe(false);
    expect(matrixMissingSections(filled).length).toBeGreaterThan(0);
  });

  it("engine-filled adult destiny matrix stays usable without a toolId", () => {
    const matrix = destinyMatrix(ADULT_DATE);
    expect(matrix).toBeTruthy();
    const filled = forceFillMissingSections("", matrix!, "Иван", "male");
    expect(matrixMissingSections(filled)).toEqual([]);
    expect(isUsableMatrixReading(filled)).toBe(true);
    expect(isUsableMatrixReading(filled, "destiny_matrix")).toBe(true);
  });
});
