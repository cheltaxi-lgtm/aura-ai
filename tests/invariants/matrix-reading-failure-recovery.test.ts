import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), history: vi.fn() }));
// The route returns before lifetime counters finish. Keep those real writes,
// but drain them before the next fixture TRUNCATE can invert their FK locks.
const lifetimeWrites = vi.hoisted(() => new Set<Promise<void>>());
vi.mock("@/lib/user-lifetime-stats", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/user-lifetime-stats")>();
  const track = (work: Promise<void>) => { lifetimeWrites.add(work); return work; };
  return {
    ...actual,
    recordLifetimeSessionActivity: (...args: Parameters<typeof actual.recordLifetimeSessionActivity>) => track(actual.recordLifetimeSessionActivity(...args)),
    recordLifetimeOrphanMemory: (...args: Parameters<typeof actual.recordLifetimeOrphanMemory>) => track(actual.recordLifetimeOrphanMemory(...args)),
  };
});
vi.mock("@/lib/services/numerology-service", () => ({ generateNumerologSessionReading: mocks.generate }));
vi.mock("@/lib/users", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/users")>(), createHistoryEntry: mocks.history }));
vi.mock("@/lib/memory/request-capture", () => ({ captureMemoryGenerationForRequest: async () => null }));
vi.mock("@/lib/memory/build-memory-context", () => ({ buildMemoryContext: async () => ({ clientBlock: "", pastSessionsBlock: "", factsBlock: "" }), appendMemoryContextToPrompt: (text: string) => text }));
vi.mock("@/lib/session-memory", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/session-memory")>(), getSessionMemories: async () => [], countSessionMemories: async () => 0 }));
vi.mock("@/lib/prompts/natal-context", () => ({ buildNatalPromptContext: async () => "" }));
vi.mock("@/lib/chat-prompts", () => ({ buildCharacterPrompt: () => "", buildHumanReadingPrompt: () => "", generateReading: vi.fn() }));
import { POST } from "@/app/api/reading/route";
import { createUser } from "@/lib/accounts";
import { ensureMinimalConsumerProfile, updateUserProfile } from "@/lib/users";
import { query } from "@/lib/db";
import { upsertMatrixSubject, ensureSelfSubject } from "@/lib/services/matrix-subject-service";
import { createAsyncJob, claimAsyncJobs, getAsyncJobById, type AsyncJobRow } from "@/lib/async-jobs";
import { WORKER_SECRET_HEADER, WORKER_USER_HEADER, WORKER_JOB_HEADER, WORKER_ATTEMPT_HEADER, WORKER_ID_HEADER } from "@/lib/async-job-worker-auth";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.runIf(hasTestDb)("Matrix reading route failure recovery", () => {
  installDbLifecycle();
  beforeAll(() => {
    vi.stubEnv("ASYNC_JOB_WORKER_SECRET", "matrix-route-test-secret");
    vi.stubEnv("REPORT_JOB_RETRY_ENABLED", "true");
  });
  afterAll(() => vi.unstubAllEnvs());
  afterEach(async () => {
    try { await Promise.all(lifetimeWrites); }
    finally { lifetimeWrites.clear(); }
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.history.mockRejectedValue(new Error("injected_secondary_history_failure"));
    // The prose boundary is injected; persistence, billing, worker leases and
    // snapshot authority are real. The route supplies its normal section repair.
    mocks.generate.mockResolvedValue({ reply: "" });
  });
  async function seed(toolId = "destiny_matrix", child = false) {
    const account = await createUser(`matrix-route-${crypto.randomUUID()}@example.invalid`, "hash", "Анна");
    const user = await ensureMinimalConsumerProfile({ accountId: account.id, name: "Анна" });
    await updateUserProfile(user.id, { birthDate: "1990-08-15", name: "Анна", gender: "female" });
    await query("UPDATE users SET rune_balance=500 WHERE id=$1", [user.id]);
    const subject = child ? await upsertMatrixSubject({ userId: user.id, kind: "child", displayName: "Мария", birthDate: "2015-02-03" }) : (await ensureSelfSubject(user.id))!;
    const payload = { characterId: "numerolog", userName: "Анна", tarotCards: [], birthDate: subject.birthDate, matrixSubjectId: subject.id, numerologToolId: toolId, async: false,
      ...(toolId === "matrix_compatibility" ? { numerologToolParams: { partnerName: "Иван", partnerDate: "1988-03-03" } } : {}) };
    await createAsyncJob({ userId: user.id, kind: "numerology_reading", payload });
    const [job] = await claimAsyncJobs({ workerId: "matrix-route-worker", kinds: ["numerology_reading"], limit: 1 });
    return { user, subject, job, payload };
  }
  function request(job: AsyncJobRow, payload: unknown) {
    return new NextRequest("http://127.0.0.1/api/reading", { method: "POST", body: JSON.stringify(payload), headers: { host: "127.0.0.1",
      [WORKER_SECRET_HEADER]: "matrix-route-test-secret", [WORKER_USER_HEADER]: job.user_id, [WORKER_JOB_HEADER]: job.id,
      [WORKER_ATTEMPT_HEADER]: String(job.attempt_count), [WORKER_ID_HEADER]: job.worker_id! } });
  }
  async function ledger(userId: string) {
    const { rows } = await query("SELECT type,count(*)::int AS n FROM rune_transactions WHERE user_id=$1 GROUP BY type", [userId]);
    return Object.fromEntries(rows.map(row => [row.type, row.n]));
  }
  it("returns and completes the durable report when secondary history fails", async () => {
    const { user, job, payload } = await seed();
    const response = await POST(request(job, payload));
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.reportId).toBeTruthy();
    expect(body.reading.length).toBeGreaterThan(3000);
    expect((await getAsyncJobById(job.id))?.status).toBe("completed");
    expect(await ledger(user.id)).toMatchObject({ spend: 1 });
    expect((await ledger(user.id)).refund).toBeUndefined();
    expect(mocks.history).toHaveBeenCalledOnce();
  });
  it("keeps the same purchase through a retryable provider failure", async () => {
    const { user, job, payload } = await seed();
    mocks.generate.mockRejectedValueOnce(new Error("fetch failed"));
    expect((await POST(request(job, payload))).status).toBe(502);
    expect(await getAsyncJobById(job.id)).toMatchObject({ status: "pending", billing_state: "charged" });
    await query("UPDATE async_jobs SET next_attempt_at=NOW() WHERE id=$1", [job.id]);
    const [second] = await claimAsyncJobs({ workerId: "matrix-route-worker", kinds: ["numerology_reading"], limit: 1 });
    const response = await POST(request(second, payload));
    expect(response.status, JSON.stringify(await response.json())).toBe(200);
    expect(await getAsyncJobById(job.id)).toMatchObject({ status: "completed", billing_state: "completed", attempt_count: 2 });
    expect(await ledger(user.id)).toMatchObject({ spend: 1 });
    expect((await ledger(user.id)).refund).toBeUndefined();
  });
  it("rejects a queued date changed after ordering before charge", async () => {
    const { user, subject, job, payload } = await seed();
    await query("UPDATE matrix_subjects SET birth_date='1988-03-03' WHERE id=$1", [subject.id]);
    const response = await POST(request(job, payload));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "matrix_subject_date_mismatch" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect((await ledger(user.id)).spend).toBeUndefined();
  });
  it("uses the child's queued date even when the buyer has a different birth date", async () => {
    const { job, payload, subject } = await seed("child_matrix", true);
    const response = await POST(request(job, payload));
    expect(response.status, JSON.stringify(await response.json())).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ birthDate: subject.birthDate, subjectKind: "child", subjectName: "Мария", userName: "Анна" }));
  });
  it("cannot save a pair after the attempt times out", async () => {
    const { user, job, payload } = await seed("matrix_compatibility");
    mocks.generate.mockImplementationOnce(async () => {
      await query("UPDATE async_jobs SET status='failed' WHERE id=$1", [job.id]);
      return { reply: "Pair result that arrived after timeout." };
    });
    expect((await POST(request(job, payload))).status).toBe(502);
    expect(Number((await query("SELECT count(*) FROM numerology_report_history WHERE user_id=$1", [user.id])).rows[0].count)).toBe(0);
  });
});
