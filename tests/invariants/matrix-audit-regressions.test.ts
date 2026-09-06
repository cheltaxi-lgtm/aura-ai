import { matrixYearForecast } from "@/lib/numerology/matrix-year-forecast";
import { matrixCompatibility, formatMatrixCompatibilityPromptBlock } from "@/lib/numerology/matrix-compatibility";
import { describe, expect, it } from "vitest";
import { createUser } from "@/lib/accounts";
import { query } from "@/lib/db";
import { ensureMinimalConsumerProfile, updateUserProfile } from "@/lib/users";
import { ensureSelfSubject, upsertMatrixSubject } from "@/lib/services/matrix-subject-service";
import { PRICING } from "@/lib/config/pricing";
import { createSession } from "@/lib/session";
import { createHistoryEntry } from "@/lib/users";
import { getOwnedMatrixSnapshot, persistOwnedMatrixSnapshot } from "@/lib/services/matrix-snapshot-persist";
import { findOwnedMatrixReportBySubject, matrixReportVersion, saveMatrixReport } from "@/lib/services/numerology-report-service";
import { createGuestMatrixPairPending } from "@/lib/services/matrix-pair-guest-service";
import { hasOwnedMatrixPairForPending, findOwnedExactMatrixPairReport } from "@/lib/numerology/matrix-pair-ownership";
import { destinyMatrix, matrixToStructuredData } from "@/lib/numerology/destiny-matrix";
import { buildNumerologSessionResult } from "@/lib/numerology/session-result";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe("matrix audit calendar and replay", () => {
  it("keeps pair metadata, prompt and both snapshots on the same version and period", () => {
    const pair = matrixCompatibility("1990-08-15", "1992-06-15", {asOfDate:"2024-01-01", calculationVersion:"matrix-v4"})!;
    expect(pair.compatibility.calculationVersion).toBe("matrix-v4");
    expect(pair.compatibility.methodologyId).toBe(pair.matrixA.methodologyId);
    expect(pair.matrixA.asOf.date).toBe("2024-01-01");
    expect(pair.matrixB.asOf.date).toBe("2024-01-01");
    expect(formatMatrixCompatibilityPromptBlock(pair)).toContain("matrix-v4");
    expect(formatMatrixCompatibilityPromptBlock(pair)).not.toContain("matrix-v5");
  });
  it("freezes annual report diagram and twelve-month facts together at the Moscow boundary", () => {
    const forecast=matrixYearForecast("1990-08-15",new Date("2026-12-31T21:30:00Z"))!;
    expect(forecast.matrix.asOf.date).toBe("2027-01-01");
    expect(forecast.matrix.calculationVersion).toBe("matrix-v5");
    expect(forecast.matrix.yearArcana.number).toBe(forecast.yearArcana.number);
    expect(forecast.months[0].year).toBe(2027);
    expect(forecast.months).toHaveLength(12);
  });
  it("uses the Matrix calendar for the yearly entitlement at New Year", () => {
    expect(matrixReportVersion("matrix_year_forecast", "matrix-v5", new Date("2026-12-31T21:30:00Z"))).toBe("matrix-v5@2027");
  });
  it("shows the saved version and period in the personal and child session preview", () => {
    const matrix = destinyMatrix("1990-08-15", { asOfDate: "2024-01-01", calculationVersion: "matrix-v4" })!;
    for (const toolId of ["destiny_matrix", "child_matrix"] as const) {
      const result = buildNumerologSessionResult({ toolId, birthDate: "1990-08-15", matrixSnapshot: matrixToStructuredData(matrix) } as Parameters<typeof buildNumerologSessionResult>[0]);
      expect(result?.destinyMatrix?.calculationVersion).toBe("matrix-v4");
      expect(result?.destinyMatrix?.asOf.date).toBe("2024-01-01");
    }
  });
});

describe.runIf(hasTestDb)("matrix audit persisted identities", () => {
  installDbLifecycle();
  async function seed() {
    const account = await createUser(`matrix-audit-${crypto.randomUUID()}@example.invalid`, "hash", "Matrix QA");
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Matrix QA" });
    await updateUserProfile(user.id, { birthDate: "1990-08-15", name: "Matrix QA", gender: "female" });
    const subject = (await ensureSelfSubject(user.id))!;
    return { user, subject };
  }
  it("finds paid pair ownership beyond the latest fifty reports", async () => {
    const {user,subject}=await seed();
    const {payload}=await createGuestMatrixPairPending({dateA:subject.birthDate,dateB:"1988-03-03"});
    const saved=await saveMatrixReport({userId:user.id,subjectId:subject.id,birthDateRaw:subject.birthDate,toolId:"matrix_compatibility",content:"Old paid pair",runeCost:30,structuredData:{partnerDate:"1988-03-03"}});
    await query(`INSERT INTO numerology_report_history(user_id,subject_id,tool_id,birth_date,calculation_version,content,structured_data) SELECT $1,$2,'matrix_compatibility',$3,'matrix-v5','Newer paid pair',jsonb_build_object('partnerDate',to_char('1992-01-01'::date+g,'YYYY-MM-DD')) FROM generate_series(1,51) g`,[user.id,subject.id,subject.birthDate]);
    expect(await hasOwnedMatrixPairForPending({userId:user.id,pendingId:payload.pendingId})).toBe(true);
    expect((await findOwnedExactMatrixPairReport({userId:user.id,dateA:subject.birthDate,dateB:"1988-03-03"}))?.id).toBe(saved.report.id);
  });
  it("keeps two partners as two reports and reuses each exact pair", async () => {
    const { user, subject } = await seed();
    const ids: string[] = [];
    for (const partnerDate of ["1992-06-15", "1988-03-03"]) {
      const saved = await saveMatrixReport({ userId: user.id, subjectId: subject.id, birthDateRaw: subject.birthDate, toolId: "matrix_compatibility", content: `Saved pair ${partnerDate}`, runeCost: 30, structuredData: { partnerDate } });
      ids.push(saved.report.id);
      expect((await findOwnedExactMatrixPairReport({ userId: user.id, dateA: subject.birthDate, dateB: partnerDate }))?.id).toBe(saved.report.id);
    }
    expect(new Set(ids).size).toBe(2);
  });
  it("rejects a mismatched selected subject without changing its identity", async () => {
    const { user, subject } = await seed();
    await persistOwnedMatrixSnapshot({ userId: user.id, subjectId: subject.id, birthDate: subject.birthDate });
    await expect(persistOwnedMatrixSnapshot({ userId: user.id, subjectId: subject.id, birthDate: "1988-03-03" })).rejects.toThrow("matrix_subject_date_mismatch");
    expect((await getOwnedMatrixSnapshot(user.id, subject.id))?.birthDate).toBe(subject.birthDate);
  });
  it("invalidates current snapshot after DOB correction but preserves old paid report", async () => {
    const { user, subject } = await seed();
    await persistOwnedMatrixSnapshot({ userId: user.id, subjectId: subject.id, birthDate: subject.birthDate });
    const old = await saveMatrixReport({ userId: user.id, subjectId: subject.id, birthDateRaw: subject.birthDate, content: "Original paid matrix", runeCost: 100 });
    await updateUserProfile(user.id, { birthDate: "1988-03-03", name: "Matrix QA", gender: "female" });
    await ensureSelfSubject(user.id);
    expect(await getOwnedMatrixSnapshot(user.id, subject.id)).toBeNull();
    expect(await findOwnedMatrixReportBySubject(user.id, subject.id)).toBeNull();
    const next = await saveMatrixReport({ userId: user.id, subjectId: subject.id, birthDateRaw: "1988-03-03", content: "Corrected date matrix", runeCost: 100 });
    expect(next.report.id).not.toBe(old.report.id);
    expect((await query("SELECT content FROM numerology_report_history WHERE id=$1", [old.report.id])).rows[0].content).toBe("Original paid matrix");
  });
  it("serializes both creation paths at the subject limit", async () => {
    const { user }=await seed();
    await query("INSERT INTO matrix_subjects(user_id,kind,birth_date) SELECT $1,'other','1991-01-01'::date FROM generate_series(1,$2)",[user.id,PRICING.MATRIX_SUBJECT_LIMIT-2]);
    const results=await Promise.allSettled([
      upsertMatrixSubject({userId:user.id,kind:"other",birthDate:"1992-01-01"}),
      persistOwnedMatrixSnapshot({userId:user.id,subjectKind:"other",birthDate:"1993-01-01"}),
      upsertMatrixSubject({userId:user.id,kind:"child",birthDate:"2010-01-01"}),
    ]);
    expect(results.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(Number((await query("SELECT count(*) FROM matrix_subjects WHERE user_id=$1",[user.id])).rows[0].count)).toBe(PRICING.MATRIX_SUBJECT_LIMIT);
  });
  it("recovers an old proven pair collision without reviving a deleted source", async () => {
    const {user,subject}=await seed();
    const session=await createSession(undefined,user.id);
    const stored=await saveMatrixReport({userId:user.id,subjectId:subject.id,birthDateRaw:subject.birthDate,toolId:"matrix_compatibility",content:"First pair",runeCost:30,structuredData:{partnerDate:"1992-06-15"},sessionId:session.id});
    const history=await createHistoryEntry({userId:user.id,characterName:"numerolog",isPaid:true,contextData:{reading:"Second paid pair preserved in history",numerologToolId:"matrix_compatibility",birthDate:subject.birthDate,numerologToolParams:{partnerDate:"1988-03-03"},sessionId:session.id}});
    expect((await findOwnedExactMatrixPairReport({userId:user.id,dateA:subject.birthDate,dateB:"1988-03-03"}))?.id).toBe(history.id);
    await query("DELETE FROM numerology_report_history WHERE id=$1",[stored.report.id]);
    expect(await findOwnedExactMatrixPairReport({userId:user.id,dateA:subject.birthDate,dateB:"1988-03-03"})).toBeNull();
  });
});
