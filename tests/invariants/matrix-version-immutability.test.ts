import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createUser, recordAccountLegalConsent } from "@/lib/accounts";
import { query } from "@/lib/db";
import {
  MATRIX_CALCULATION_VERSION,
  MATRIX_METHODOLOGY_ID,
  MATRIX_V3_CALCULATION_VERSION,
  destinyMatrix,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import { hydrateDestinyMatrixFromSnapshot } from "@/lib/numerology/matrix-snapshot";
import { ensureSelfSubject } from "@/lib/services/matrix-subject-service";
import { saveMatrixReport } from "@/lib/services/numerology-report-service";
import { ensureMinimalConsumerProfile, updateUserProfile } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const ROOT = path.resolve(__dirname, "../..");

describe("matrix version immutability", () => {
  it("documents that overwrite cannot delete another calculation_version", () => {
    const src = readFileSync(
      path.join(ROOT, "src/lib/services/numerology-report-service.ts"),
      "utf8"
    );
    expect(src).toContain("AND calculation_version = $4");
    expect(src).not.toMatch(
      /DELETE FROM numerology_report_history[\s\S]{0,220}subject_id = \$3::uuid\s+\$\{ownedVersionClause/
    );
  });
});

describe.runIf(hasTestDb)("matrix version rows (db)", () => {
  installDbLifecycle();

  it("keeps v3 and v4 reports for the same subject", async () => {
    const account = await createUser(`mx-ver-${Date.now()}@example.com`, "hash", "Версии");
    await recordAccountLegalConsent(account.id, { ageConfirmed: true, acceptedTerms: true });
    const user = await ensureMinimalConsumerProfile({
      accountId: account.id,
      name: "Версии",
    });
    await updateUserProfile(user.id, { name: "Версии", gender: "female", birthDate: "1990-08-15" });
    const self = await ensureSelfSubject(user.id);
    expect(self?.id).toBeTruthy();

    const v3 = destinyMatrix("1990-08-15", {
      asOfDate: "2026-01-01",
      calculationVersion: MATRIX_V3_CALCULATION_VERSION,
    })!;
    const v4 = destinyMatrix("1990-08-15", { asOfDate: "2026-01-01" })!;
    expect(v3.comfort.number).not.toBe(v4.comfort.number);

    await saveMatrixReport({
      userId: user.id,
      birthDateRaw: "1990-08-15",
      subjectId: self!.id,
      content: `v3 comfort ${v3.comfort.number}`,
      runeCost: 0,
      calculationVersion: MATRIX_V3_CALCULATION_VERSION,
      structuredData: matrixToStructuredData(v3),
    });
    await saveMatrixReport({
      userId: user.id,
      birthDateRaw: "1990-08-15",
      subjectId: self!.id,
      content: `v4 comfort ${v4.comfort.number}`,
      runeCost: 0,
      calculationVersion: MATRIX_CALCULATION_VERSION,
      structuredData: matrixToStructuredData(v4),
    });

    const rows = await query<{
      calculation_version: string;
      content: string;
      methodology_id: string;
      structured_data: Record<string, unknown>;
    }>(
      `SELECT calculation_version, content, methodology_id, structured_data
       FROM numerology_report_history
       WHERE user_id = $1 AND subject_id = $2::uuid
       ORDER BY calculation_version`,
      [user.id, self!.id]
    );
    expect(rows.rows).toHaveLength(2);

    const old = rows.rows.find((r) => r.calculation_version === "matrix-v3")!;
    const next = rows.rows.find((r) => r.calculation_version === MATRIX_CALCULATION_VERSION)!;
    expect(old.content).toContain(String(v3.comfort.number));
    expect(next.content).toContain(String(v4.comfort.number));
    expect(old.methodology_id).toBe("zovus-matrix-subtract22-v3");
    expect(next.methodology_id).toBe(MATRIX_METHODOLOGY_ID);
    expect(hydrateDestinyMatrixFromSnapshot(old.structured_data)!.comfort.number).toBe(
      v3.comfort.number
    );
    expect(hydrateDestinyMatrixFromSnapshot(next.structured_data)!.comfort.number).toBe(
      v4.comfort.number
    );

    await saveMatrixReport({
      userId: user.id,
      birthDateRaw: "1990-08-15",
      subjectId: self!.id,
      content: "v4 overwritten",
      runeCost: 0,
      calculationVersion: MATRIX_CALCULATION_VERSION,
      overwrite: true,
      structuredData: matrixToStructuredData(v4),
    });
    const after = await query<{ calculation_version: string; content: string }>(
      `SELECT calculation_version, content FROM numerology_report_history
       WHERE user_id = $1 AND subject_id = $2::uuid`,
      [user.id, self!.id]
    );
    expect(after.rows).toHaveLength(2);
    expect(after.rows.find((r) => r.calculation_version === "matrix-v3")?.content).toContain(
      String(v3.comfort.number)
    );

    await query(
      `DELETE FROM numerology_report_history
       WHERE user_id = $1 AND subject_id = $2::uuid AND calculation_version = $3`,
      [user.id, self!.id, MATRIX_CALCULATION_VERSION]
    );
    const remaining = await query<{ calculation_version: string }>(
      `SELECT calculation_version FROM numerology_report_history
       WHERE user_id = $1 AND subject_id = $2::uuid`,
      [user.id, self!.id]
    );
    expect(remaining.rows).toHaveLength(1);
    expect(remaining.rows[0]?.calculation_version).toBe("matrix-v3");
  });
});
