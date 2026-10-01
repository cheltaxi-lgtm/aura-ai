import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createUser } from "@/lib/accounts";
import { query, getPool } from "@/lib/db";
import { getRuneSettings, setRuneSettings } from "@/lib/rune-settings";
import { createSession, updateSessionChatMeta } from "@/lib/session";
import { getCabinetSessions } from "@/lib/cabinet-data";
import { ensureMinimalConsumerProfile, updateUserProfile } from "@/lib/users";
import { ensureSelfSubject, upsertMatrixSubject, getMatrixSubject } from "@/lib/services/matrix-subject-service";
import { saveMatrixReport, getUserMatrixReportById } from "@/lib/services/numerology-report-service";
import { createAsyncJob, claimAsyncJobs, getAsyncJobById, claimAsyncJobForSave, completeAsyncJob, failAsyncJobAndRefundIfCharged, retryOrFailReportJob, refundChargedAsyncJobIfNeeded, type AsyncJobRow } from "@/lib/async-jobs";
import { chargeRuneActionForWorkerJob, refundWorkerJobCharge, beginWorkerJobSave } from "@/lib/async-job-lifecycle";
import { WORKER_SECRET_HEADER, WORKER_USER_HEADER, WORKER_JOB_HEADER, WORKER_ATTEMPT_HEADER, WORKER_ID_HEADER } from "@/lib/async-job-worker-auth";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.runIf(hasTestDb)("Matrix purchase and worker attempt isolation", () => {
  installDbLifecycle();
  beforeAll(() => {
    vi.stubEnv("ASYNC_JOB_WORKER_SECRET", "matrix-test-worker-secret");
    // All transactional branches must work without borrowing a second connection.
    vi.stubEnv("DB_POOL_MAX_WORKER", "1");
    expect(getPool().options.max).toBe(1);
  });
  afterAll(() => vi.unstubAllEnvs());
  function request(job: AsyncJobRow) {
    return new NextRequest("http://127.0.0.1/api/reading", { headers: { host: "127.0.0.1",
      [WORKER_SECRET_HEADER]: "matrix-test-worker-secret", [WORKER_USER_HEADER]: job.user_id,
      [WORKER_JOB_HEADER]: job.id, [WORKER_ATTEMPT_HEADER]: String(job.attempt_count), [WORKER_ID_HEADER]: job.worker_id! } });
  }
  async function seed() {
    const account = await createUser(`matrix-deep-${crypto.randomUUID()}@example.invalid`, "hash", "Matrix QA");
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Matrix QA" });
    await updateUserProfile(user.id, { birthDate: "1990-08-15", name: "Matrix QA", gender: "female" });
    await query("UPDATE users SET rune_balance=500 WHERE id=$1", [user.id]);
    const subject = (await ensureSelfSubject(user.id))!;
    const jobId = await createAsyncJob({ userId: user.id, kind: "numerology_reading", payload: { birthDate: subject.birthDate, matrixSubjectId: subject.id } });
    const [job] = await claimAsyncJobs({ workerId: "matrix-worker", kinds: ["numerology_reading"], limit: 1 });
    expect(job.id).toBe(jobId);
    return { user, subject, job };
  }
  it("fences stale save, complete, retry and refund even after the same worker reclaims", async () => {
    const { user, subject, job: old } = await seed();
    const charge = await chargeRuneActionForWorkerJob({ request: request(old), userId: user.id, action: "NUMEROLOGY_SESSION" });
    expect(charge.spentRunes).toBeGreaterThan(0);
    await query("UPDATE async_jobs SET status='pending',worker_id=NULL,locked_at=NULL WHERE id=$1", [old.id]);
    const [current] = await claimAsyncJobs({ workerId: "matrix-worker", kinds: ["numerology_reading"], limit: 1 });
    const oldAttempt = { workerId: old.worker_id!, attemptCount: old.attempt_count };
    expect(await claimAsyncJobForSave(old.id, oldAttempt)).toBe(false);
    expect(await completeAsyncJob(old.id, { reading: "stale" }, oldAttempt)).toBe(false);
    expect((await failAsyncJobAndRefundIfCharged(old.id, "stale", "generation_failed", oldAttempt)).failed).toBe(false);
    await retryOrFailReportJob({ jobId: old.id, message: "stale", errorCode: "generation_failed", attempt: oldAttempt });
    expect((await refundWorkerJobCharge(request(old), { userId: user.id, cost: charge.spentRunes, wasFreeQuestion: false, transactionId: charge.transactionId })).refunded).toBe(false);
    await expect(saveMatrixReport({ userId: user.id, subjectId: subject.id, birthDateRaw: subject.birthDate, content: "Stale report", runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId, workerJob: { jobId: old.id, attempt: oldAttempt } })).rejects.toThrow("stale_async_job_attempt");
    const reused = await chargeRuneActionForWorkerJob({ request: request(current), userId: user.id, action: "NUMEROLOGY_SESSION" });
    expect(reused.transactionId).toBe(charge.transactionId);
    expect(await beginWorkerJobSave(request(current))).toBe(true);
    const saved = await saveMatrixReport({ userId: user.id, subjectId: subject.id, birthDateRaw: subject.birthDate, content: "Current report", runeCost: charge.spentRunes,
      chargeTransactionId: charge.transactionId, workerJob: { jobId: current.id, attempt: { workerId: current.worker_id!, attemptCount: current.attempt_count } } });
    // A late duplicate or secondary failure cannot refund the delivered receipt.
    expect((await refundWorkerJobCharge(request(current), { userId: user.id, cost: charge.spentRunes, wasFreeQuestion: false, transactionId: charge.transactionId })).refunded).toBe(false);
    expect(await completeAsyncJob(current.id, { reading: saved.report.content }, { workerId: current.worker_id!, attemptCount: current.attempt_count })).toBe(true);
    expect((await getAsyncJobById(current.id))?.status).toBe("completed");
    expect(Number((await query("SELECT count(*) FROM rune_transactions WHERE user_id=$1 AND type='spend'", [user.id])).rows[0].count)).toBe(1);
    expect(Number((await query("SELECT count(*) FROM rune_transactions WHERE user_id=$1 AND type='refund'", [user.id])).rows[0].count)).toBe(0);
  });
  it("charges distinct purchases in the same moment and binds each ledger row atomically", async () => {
    const { user, job } = await seed();
    await createAsyncJob({ userId: user.id, kind: "numerology_reading", payload: { birthDate: "1988-03-03" } });
    const [second] = await claimAsyncJobs({ workerId: "matrix-worker", kinds: ["numerology_reading"], limit: 1 });
    const charges = await Promise.all([job, second].map(current => chargeRuneActionForWorkerJob({ request: request(current), userId: user.id, action: "NUMEROLOGY_SESSION" })));
    expect(new Set(charges.map(c => c.transactionId)).size).toBe(2);
    for (let i = 0; i < 2; i++) expect((await getAsyncJobById([job, second][i].id))?.charge_transaction_id).toBe(charges[i].transactionId);
  });
  it("uses the configured price with a single database connection", async () => {
    const settings = await getRuneSettings();
    try {
      await setRuneSettings({ costs: { ...settings.costs, NUMEROLOGY_SESSION: 73 } });
      const { user, job } = await seed();
      const started = Date.now();
      const charge = await chargeRuneActionForWorkerJob({ request: request(job), userId: user.id, action: "NUMEROLOGY_SESSION" });
      expect(charge.spentRunes).toBe(73);
      expect(charge.newBalance).toBe(427);
      expect(Date.now() - started).toBeLessThan(3000);
    } finally {
      await setRuneSettings(settings);
    }
  });
  it("cannot reuse a cheaper or refunded purchase through a synchronous caller key", async () => {
    const { user } = await seed();
    const req = () => new NextRequest("http://localhost/api/reading", { headers: { "Idempotency-Key": "same-caller-key" } });
    const first = await chargeRuneActionForWorkerJob({ request: req(), userId: user.id, action: "NUMEROLOGY_SESSION" });
    expect((await refundWorkerJobCharge(req(), { userId: user.id, cost: first.spentRunes, wasFreeQuestion: false, transactionId: first.transactionId })).refunded).toBe(true);
    const second = await chargeRuneActionForWorkerJob({ request: req(), userId: user.id, action: "CHILD_MATRIX_REPORT" });
    expect(second.spentRunes).toBeGreaterThan(0);
    expect(second.transactionId).not.toBe(first.transactionId);
  });
  it("recovers a durable report after a crash without refunding its purchase", async () => {
    const { user, subject, job } = await seed();
    const charge = await chargeRuneActionForWorkerJob({ request: request(job), userId: user.id, action: "NUMEROLOGY_SESSION" });
    const saved = await saveMatrixReport({ userId: user.id, subjectId: subject.id, birthDateRaw: subject.birthDate, content: "Durable report", runeCost: charge.spentRunes, chargeTransactionId: charge.transactionId });
    await query("UPDATE async_jobs SET status='failed' WHERE id=$1", [job.id]);
    expect(await refundChargedAsyncJobIfNeeded(job.id)).toBe(false);
    expect(await getAsyncJobById(job.id)).toMatchObject({ status: "completed", billing_state: "completed", result: { reportId: saved.report.id, reading: "Durable report" } });
  });
  it.each(["Asia/Yekaterinburg", "Pacific/Apia", "America/Los_Angeles"])("preserves PostgreSQL DATE for subjects and reports in %s", async TZ => {
    const previous = process.env.TZ;
    process.env.TZ = TZ;
    try {
      const { user, subject } = await seed();
      expect(subject.birthDate).toBe("1990-08-15");
      expect((await ensureSelfSubject(user.id))?.birthDate).toBe("1990-08-15");
      expect((await query("SELECT birth_date::text FROM matrix_subjects WHERE id=$1", [subject.id])).rows[0].birth_date).toBe("1990-08-15");
      const child = await upsertMatrixSubject({ userId: user.id, kind: "child", displayName: "QA child", birthDate: "2011-12-30" });
      expect(child.birthDate).toBe("2011-12-30");
      expect((await getMatrixSubject(user.id, child.id))?.birthDate).toBe(child.birthDate);
      const session = await createSession(undefined, user.id);
      await updateSessionChatMeta(session.id, { characterKey: "numerolog", intention: "child_matrix", spreadType: "new", spreadId: "child_matrix", cards: [] });
      const saved = await saveMatrixReport({ userId: user.id, subjectId: child.id, toolId: "child_matrix", birthDateRaw: child.birthDate, content: "Calendar fixture", runeCost: 0, sessionId: session.id });
      expect(saved.report.birthDate).toBe("2011-12-30");
      expect((await getUserMatrixReportById(user.id, saved.report.id))?.birthDate).toBe("2011-12-30");
      expect((await getCabinetSessions(user.id)).sessions.find(item => item.sessionId === session.id)?.matrixBirthDate).toBe("2011-12-30");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
});
