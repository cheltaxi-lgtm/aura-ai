import { describe, expect, it } from "vitest";
import { createUser } from "@/lib/accounts";
import { query } from "@/lib/db";
import { ensureMinimalConsumerProfile, updateUserProfile } from "@/lib/users";
import { ensureSelfSubject } from "@/lib/services/matrix-subject-service";
import { createSession } from "@/lib/session";
import { lookupOwnedMatrixReportBySubject, saveMatrixReport } from "@/lib/services/numerology-report-service";
import { generateFullMatrixSectionedReading } from "@/lib/numerology/matrix-sectioned-reading";
import { matrixToStructuredData } from "@/lib/numerology/destiny-matrix";
import { matrixReadingToStructuredPayload } from "@/lib/numerology/matrix-reading-document";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { matrixReportRepairFacts } from "@/lib/numerology/matrix-report-display";
import { persistOwnedMatrixSnapshot } from "@/lib/services/matrix-snapshot-persist";
import { destinyMatrix } from "@/lib/numerology/destiny-matrix";

describe.runIf(hasTestDb)("durable free repair of a purchased Matrix", () => {
  installDbLifecycle();
  async function seed() {
    const account = await createUser(`matrix-repair-${crypto.randomUUID()}@example.invalid`, "hash", "Matrix QA");
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Matrix QA" });
    await updateUserProfile(user.id, { birthDate: "1990-08-15", name: "Matrix QA", gender: "female" });
    const subject = (await ensureSelfSubject(user.id))!;
    const session = await createSession(undefined, user.id);
    const generated = await generateFullMatrixSectionedReading({ birthDate: subject.birthDate, name: "Matrix QA", useLlm: false, asOfDate: "2026-10-01" });
    const data = { ...matrixToStructuredData(generated.matrix), reading: matrixReadingToStructuredPayload(generated.document) };
    const charge = (await query<{ id: string }>("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description) VALUES($1,'spend',-60,100,'Synthetic Matrix receipt') RETURNING id", [user.id])).rows[0]!.id;
    const broken = generated.reading.replace(/^5\)[^\n]+/m, "5) Запиши незавершённое наблюд");
    const params = { userId: user.id, subjectId: subject.id, birthDateRaw: subject.birthDate, runeCost: 60, chargeTransactionId: charge, sessionId: session.id, structuredData: data };
    const saved = await saveMatrixReport({ ...params, content: broken });
    return { user, subject, charge, params, saved, broken, complete: generated.reading };
  }
  it("retains paid ownership after a rejected replacement, then repairs the same ID and receipt", async () => {
    const s = await seed();
    await expect(saveMatrixReport({ ...s.params, content: s.broken, repairUnusableReportId: s.saved.report.id, runeCost: 0 })).rejects.toThrow("invalid_matrix_report_repair_content");
    const prior = await lookupOwnedMatrixReportBySubject(s.user.id, s.subject.id);
    expect(prior.unusable).toBe(true); expect(prior.report?.id).toBe(s.saved.report.id);
    const repaired = await saveMatrixReport({ ...s.params, content: s.complete, repairUnusableReportId: s.saved.report.id, runeCost: 0, chargeTransactionId: crypto.randomUUID() });
    expect(repaired.status).toBe("updated"); expect(repaired.report.id).toBe(s.saved.report.id);
    const row = (await query<{ rune_cost: number; charge_transaction_id: string }>("SELECT rune_cost,charge_transaction_id FROM numerology_report_history WHERE id=$1", [s.saved.report.id])).rows[0]!;
    expect(row.rune_cost).toBe(60); expect(row.charge_transaction_id).toBe(s.charge);
    expect((await lookupOwnedMatrixReportBySubject(s.user.id, s.subject.id)).usable).toBe(true);
    expect((await query("SELECT id FROM rune_transactions WHERE user_id=$1 AND type='spend'", [s.user.id])).rows).toHaveLength(1);
  });
  it("does not repair a report belonging to another owner", async () => {
    const a = await seed(); const b = await seed();
    await expect(saveMatrixReport({ ...b.params, content: b.complete, repairUnusableReportId: a.saved.report.id })).rejects.toThrow("invalid_matrix_report_repair");
    expect((await lookupOwnedMatrixReportBySubject(a.user.id, a.subject.id)).report?.content).toBe(a.broken);
  });
  it("serializes concurrent repairs and retains the first complete replacement", async () => {
    const s = await seed();
    const results = await Promise.all(["Первый", "Второй"].map(label => saveMatrixReport({ ...s.params, content: `${label}.\n${s.complete}`, repairUnusableReportId: s.saved.report.id, runeCost: 0 })));
    expect(results.map(r => r.status).sort()).toEqual(["already_saved", "updated"]);
    expect(results[0]!.report.id).toBe(results[1]!.report.id);
    expect(results[0]!.report.content).toBe(results[1]!.report.content);
  });
  it("repairs a paid v4 report with its original period after the subject cache advances to v5", async () => {
    const s = await seed();
    const historical = destinyMatrix(s.subject.birthDate, { calculationVersion: "matrix-v4", asOfDate: "2025-01-02" })!;
    const historicalCharge = (await query<{ id: string }>("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description) VALUES($1,'spend',-60,40,'Synthetic historical Matrix receipt') RETURNING id", [s.user.id])).rows[0]!.id;
    const old = await saveMatrixReport({ ...s.params, chargeTransactionId: historicalCharge, content: "Old incomplete paid v4", calculationVersion: "matrix-v4", structuredData: matrixToStructuredData(historical, s.subject.birthDate) });
    await persistOwnedMatrixSnapshot({ userId: s.user.id, subjectId: s.subject.id, birthDate: s.subject.birthDate, snapshot: matrixToStructuredData(destinyMatrix(s.subject.birthDate, { asOfDate: "2026-10-01" })!, s.subject.birthDate) });
    const facts = matrixReportRepairFacts(old.report);
    expect(facts.calculationVersion).toBe("matrix-v4"); expect(facts.asOfDate).toBe("2025-01-02");
    const replacement = await generateFullMatrixSectionedReading({ birthDate: s.subject.birthDate, name: "Matrix QA", useLlm: false, snapshot: facts.snapshot });
    const saved = await saveMatrixReport({ ...s.params, repairUnusableReportId: old.report.id, calculationVersion: facts.calculationVersion, content: replacement.reading, structuredData: { ...facts.snapshot, reading: matrixReadingToStructuredPayload(replacement.document) } });
    expect(saved.report.id).toBe(old.report.id); expect(saved.report.calculationVersion).toBe("matrix-v4");
    expect(saved.report.structuredData?.asOf).toMatchObject({ date: "2025-01-02" });
  });
});
