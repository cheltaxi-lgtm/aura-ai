import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fullMatrixSessionHref,
  matrixToolForSubjectKind,
} from "@/lib/numerology/matrix-subject-routing";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("matrix subject routing", () => {
  it("maps child subjects to child_matrix and everyone else to destiny_matrix", () => {
    expect(matrixToolForSubjectKind("child")).toBe("child_matrix");
    expect(matrixToolForSubjectKind("self")).toBe("destiny_matrix");
    expect(matrixToolForSubjectKind("partner")).toBe("destiny_matrix");
    expect(matrixToolForSubjectKind("other")).toBe("destiny_matrix");
    expect(matrixToolForSubjectKind(null)).toBe("destiny_matrix");
  });

  it("paid session href for a child does not open the adult tool", () => {
    expect(
      fullMatrixSessionHref({ subjectId: "sub-1", subjectKind: "child" })
    ).toBe("/?numerolog=1&tool=child_matrix&subjectId=sub-1");
    expect(
      fullMatrixSessionHref({ subjectId: "sub-2", subjectKind: "self" })
    ).toBe("/?numerolog=1&tool=destiny_matrix&subjectId=sub-2");
  });

  it("reading route rejects adult Full Matrix on a child subject", () => {
    const src = readSrc("src/app/api/reading/route.ts");
    expect(src).toContain("requestNumerologToolId === MATRIX_REPORT_TOOL_ID");
    expect(src).toContain('resolvedMatrixSubject.kind === "child"');
    expect(src).toContain("matrix_subject_kind_mismatch");
  });

  it("session picker does not offer children on the adult Full Matrix tool", () => {
    const picker = readSrc("src/components/numerolog/NumerologCalculationPicker.tsx");
    expect(picker).toContain('visibleKinds={isChildMatrix ? ["child"] : ["self", "partner", "other"]}');
    expect(picker).not.toContain('allowKinds={isChildMatrix ? ["child"] : ["child", "partner", "other"]}');
  });
});
