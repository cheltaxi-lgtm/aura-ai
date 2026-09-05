import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  query: vi.fn(), owned: vi.fn(), getReport: vi.fn(), subject: vi.fn(), charge: vi.fn(), rollback: vi.fn(),
  createSession: vi.fn(), generate: vi.fn(), save: vi.fn(), history: vi.fn(), bind: vi.fn(), boundSession: vi.fn(),
  intent: vi.fn(), claim: vi.fn(), billing: vi.fn(),
  usable: vi.fn(), wipe: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ query: (sql: string, args: unknown[]) => {
  if (sql.startsWith('SELECT') && sql.includes('FROM bot_matrix_operations')) return m.intent(sql, args);
  if (sql.startsWith('INSERT INTO bot_matrix_operations')) return m.claim(sql, args);
  return m.query(sql, args);
} }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: vi.fn(async () => false) }));
vi.mock("@/lib/telegram/bot-resolve", () => ({ resolveBotUser: vi.fn(async () => ({
  linked: true, accountId: "account", profileUserId: "profile", name: "Owner", linkUrl: "/cabinet",
})) }));
vi.mock("@/lib/users", () => ({
  getUserById: vi.fn(async () => ({ name: "Owner", birth_date: "1990-01-01", gender: "female" })),
  createHistoryEntry: m.history,
}));
vi.mock("@/lib/services/matrix-subject-service", () => ({
  getMatrixSubject: m.subject, ensureSelfSubject: m.subject,
  deleteMatrixSubject: vi.fn(), isMatrixSubjectKind: vi.fn(), listMatrixSubjects: vi.fn(), upsertMatrixSubject: vi.fn(),
}));
vi.mock("@/lib/numerology/tools", () => ({ getNumerologTool: vi.fn(() => ({ cost: 90 })) }));
vi.mock("@/lib/services/numerology-report-service", () => ({
  findOwnedMatrixReportBySubject: m.owned, findOwnedMatrixReport: m.owned, getUserMatrixReportById: m.getReport,
  saveMatrixReport: m.save, toIsoBirthDate: (value: string) => value,
  deleteOwnedMatrixReportsForBirth: m.wipe, deleteOwnedMatrixReportsForSubject: m.wipe, listUserMatrixReports: vi.fn(),
}));
vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { chargeForSession: m.charge, rollbackChargeEx: m.rollback },
  InsufficientFundsError: class extends Error {},
}));
vi.mock("@/lib/telegram/bot-charge-idempotency", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/telegram/bot-charge-idempotency")>(),
  bindBotChargeSession: m.bind, findSessionIdForBotCharge: m.boundSession,
}));
vi.mock("@/lib/rune-service", () => ({ getRuneBalance: vi.fn(async () => 900), isRuneBillingActive: m.billing }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/session", () => ({ createSession: m.createSession, getSession: vi.fn(), updateSessionChatMeta: vi.fn() }));
vi.mock("@/lib/memory/build-memory-context", () => ({ buildMemoryContext: vi.fn(async () => ({ clientBlock: "", pastSessionsBlock: "", factsBlock: "" })) }));
vi.mock("@/lib/services/numerology-service", () => ({ generateNumerologSessionReading: m.generate }));
vi.mock("@/lib/services/matrix-snapshot-persist", () => ({ ensureOwnedMatrixSnapshot: vi.fn(async () => ({ snapshot: {}, asOfDate: "2026-09-05" })) }));
vi.mock("@/lib/numerology/matrix-snapshot", () => ({ resolveMatrixForDisplay: vi.fn(() => null), resolveMatrixForEngine: vi.fn(() => null), resolveMatrixForDisplayDetailed: vi.fn() }));
vi.mock("@/lib/numerology/destiny-matrix", () => ({
  DESTINY_MATRIX_DIAGRAM_SLOTS: [], destinyMatrix: vi.fn(() => null), matrixToStructuredData: vi.fn(), MATRIX_CALCULATION_VERSION: "test",
  isLegacyMatrixCalculationVersion: vi.fn(() => false),
}));
vi.mock("@/lib/chat-reply-sanitize", () => ({ isUsableMatrixReading: m.usable, sanitizeReadingForClient: (text: string) => text }));
vi.mock("@/lib/numerology/matrix-session-cleanup", () => ({ purgeMatrixConsultationSessions: vi.fn(), wipeUserMatrixReports: vi.fn() }));
vi.mock("@/lib/spread-reading-persist", () => ({ ensureSpreadReadingInChatMessages: vi.fn() }));

import { botMatrixGet, botMatrixRun } from "@/lib/telegram/bot-matrix-service";

describe("Telegram matrix operation identity", () => {
  const subject = { id: "subject-child", kind: "child", displayName: "Child", birthDate: "2015-02-03" };
  const report = { id: "report-current", subjectId: subject.id, toolId: "child_matrix", content: "Full saved reading", sessionId: "session-current", birthDate: subject.birthDate, structuredData: null, calculationVersion: "test", createdAt: "2026-09-05" };
  beforeEach(() => {
    vi.clearAllMocks();
    m.subject.mockResolvedValue(subject);
    m.owned.mockResolvedValue({ ...report, id: "unrelated-older-report" });
    m.getReport.mockResolvedValue(report);
    m.query.mockResolvedValue({ rows: [], rowCount: 1 });
    m.intent.mockResolvedValue({ rows: [] });
    m.claim.mockImplementation(async (_sql: string, args: unknown[]) => ({ rows: [{ input: JSON.parse(String(args[2])), billing_required: args[3], status: 'pending', session_id: null, expired: false }], rowCount: 1 }));
    m.billing.mockReturnValue(true);
    m.usable.mockReturnValue(true);
    m.charge.mockResolvedValue({ transactionId: "charge-current", spentRunes: 90, newBalance: 810, deduplicated: false });
    m.rollback.mockResolvedValue({ refunded: true, balance: 900 });
    m.createSession.mockResolvedValue({ id: "session-current" });
    m.generate.mockResolvedValue({ reply: "Full saved reading" });
    m.save.mockResolvedValue({ status: "updated", report });
    m.history.mockResolvedValue({ id: "history-current" });
    m.boundSession.mockResolvedValue("session-current");
  });

  it("uses the owned report subject, ignoring a caller's different subject claim", async () => {
    const result = await botMatrixGet(123, report.id, "self-subject");
    expect(result).toMatchObject({ ok: true, subjectId: subject.id, subjectKind: "child", subjectName: "Child" });
    expect(m.subject).toHaveBeenCalledWith("profile", subject.id);
  });
  it("uses a different charge key for each explicitly confirmed replacement", async () => {
    expect((await botMatrixRun(123, { replace: true, subjectId: subject.id, operationId: "operation-1" })).ok).toBe(true);
    expect((await botMatrixRun(123, { replace: true, subjectId: subject.id, operationId: "operation-2" })).ok).toBe(true);
    expect(m.charge.mock.calls.map(([input]) => input.idempotencyKey)).toEqual([
      "tg-matrix:subject-child:operation-1", "tg-matrix:subject-child:operation-2",
    ]);
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ toolId: "child_matrix", subjectId: subject.id }));
    expect(m.bind).toHaveBeenCalledWith("charge-current", "session-current");
  });
  it("returns pending for an unfinished replacement instead of the old report", async () => {
    m.charge.mockResolvedValue({ transactionId: "charge-current", spentRunes: 0, newBalance: 810, deduplicated: true });
    const result = await botMatrixRun(123, { replace: true, subjectId: subject.id, operationId: "operation-1" });
    expect(result).toMatchObject({ ok: true, pending: true, content: "", reportId: "", sessionId: "session-current" });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.createSession).not.toHaveBeenCalled();
  });
  it("resumes only the report associated with the exact charged operation", async () => {
    m.charge.mockResolvedValue({ transactionId: "charge-current", spentRunes: 0, newBalance: 810, deduplicated: true });
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("charge_transaction_id") ? [report] : [], rowCount: 1 }));
    const result = await botMatrixRun(123, { replace: true, subjectId: subject.id, operationId: "operation-1" });
    expect(result).toMatchObject({ ok: true, reportId: report.id, charged: 0, reused: true, subjectId: subject.id });
    expect(m.getReport).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("restores A's original owned session after replacement B overwrites the same report row", async () => {
    m.charge.mockResolvedValue({ transactionId: "charge-A", spentRunes: 0, newBalance: 720, deduplicated: true });
    m.boundSession.mockResolvedValue("session-A");
    m.owned.mockResolvedValue({ ...report, content: "LATEST_REPLACEMENT_B", sessionId: "session-B" });
    m.getReport.mockResolvedValue({ ...report, content: "LATEST_REPLACEMENT_B", sessionId: "session-B" });
    m.query.mockImplementation(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM sessions s")) {
        expect(args).toEqual(["session-A", "profile"]);
        expect(sql).toContain("s.user_id = $2");
        expect(sql).toContain("cm.owner_user_id = $2");
        return { rows: [{ content: "ORIGINAL_PAID_READING_A", receipt: null }] };
      }
      return { rows: [] };
    });
    const result = await botMatrixRun(123, { replace: true, subjectId: subject.id, operationId: "operation-A" });
    expect(result).toMatchObject({ ok: true, sessionId: "session-A", reportId: "", content: "ORIGINAL_PAID_READING_A",
      charged: 0, reused: true, diagram: null, diagramUnavailable: true });
    expect(result).not.toHaveProperty("pending", true);
    expect(JSON.stringify(result)).not.toContain("LATEST_REPLACEMENT_B");
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.getReport).not.toHaveBeenCalled();
  });
  it("keeps original report birth metadata when the subject was edited after purchase", async () => {
    m.subject.mockResolvedValue({ ...subject, birthDate: "2016-07-08" });
    m.charge.mockResolvedValue({ transactionId: "charge-A", spentRunes: 0, newBalance: 720, deduplicated: true });
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("charge_transaction_id") ? [report] : [] }));
    const result = await botMatrixRun(123, { replace: true, subjectId: subject.id, operationId: "operation-A" });
    expect(result).toMatchObject({ ok: true, birthDate: "2015-02-03", subject: { birthDate: "2015-02-03" } });
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("terminates an old missing original result instead of reporting pending forever", async () => {
    m.charge.mockResolvedValue({ transactionId: "charge-A", spentRunes: 0, newBalance: 720, deduplicated: true });
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("AS expired") ? [{ expired: true }] : [] }));
    expect(await botMatrixRun(123, { replace: true, operationId: "operation-A" })).toMatchObject({ ok: false, error: "not_available" });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.rollback).not.toHaveBeenCalled();
  });
  it("identifies a refunded operation as failed instead of claiming it is running", async () => {
    m.charge.mockResolvedValue({ transactionId: "charge-current", spentRunes: 0, newBalance: 900, deduplicated: true });
    m.query.mockResolvedValue({ rows: [{ id: "refund" }], rowCount: 1 });
    expect(await botMatrixRun(123, { replace: true, operationId: "operation-1" })).toMatchObject({ ok: false, error: "operation_failed", refunded: true });
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("refunds when session setup fails after charging", async () => {
    m.createSession.mockRejectedValue(new Error("session database failure"));
    expect(await botMatrixRun(123, { replace: true, operationId: "operation-1" })).toMatchObject({ ok: false, refunded: true });
    expect(m.rollback).toHaveBeenCalledOnce();
  });
  it("keeps the paid result when history delivery fails after report persistence", async () => {
    m.history.mockRejectedValue(new Error("history unavailable"));
    expect(await botMatrixRun(123, { replace: true, operationId: "operation-1" })).toMatchObject({ ok: true, reportId: report.id, charged: 90 });
    expect(m.rollback).not.toHaveBeenCalled();
  });
  it("requires an operation ID before a new purchase", async () => {
    expect(await botMatrixRun(123, { replace: true })).toMatchObject({ ok: false, error: "operation_required" });
    expect(m.charge).not.toHaveBeenCalled();
  });
  it("claims a free operation before generation and persists the original result without a debit", async () => {
    m.billing.mockReturnValue(false);
    const result = await botMatrixRun(123, { replace: true, operationId: 'free-A' });
    expect(result).toMatchObject({ ok: true, charged: 0 });
    expect(m.charge).not.toHaveBeenCalled();
    expect(m.claim.mock.invocationCallOrder[0]).toBeLessThan(m.generate.mock.invocationCallOrder[0]);
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining("'{botMatrixReceipt,content}'"), ['session-current', 'profile', 'Full saved reading']);
  });
  it("does not charge or regenerate a previous free request after paid access resumes", async () => {
    m.intent.mockResolvedValue({ rows: [{ input: { subjectId: subject.id, toolId: 'child_matrix', birthDate: subject.birthDate },
      billing_required: false, status: 'pending', session_id: 'free-session-A', expired: false }] });
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM sessions s') ? [{ content: 'FREE_ORIGINAL_A', receipt: null }] : [], rowCount: 1 }));
    const result = await botMatrixRun(123, { replace: true, operationId: 'free-A' });
    expect(result).toMatchObject({ ok: true, charged: 0, content: 'FREE_ORIGINAL_A', sessionId: 'free-session-A' });
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.charge).not.toHaveBeenCalled();
  });
  it("keeps an unbound concurrent free claim pending and expires it without executing twice", async () => {
    m.billing.mockReturnValue(false);
    const row = { input: { subjectId: subject.id, toolId: 'child_matrix', birthDate: subject.birthDate },
      billing_required: false, status: 'pending', session_id: null, expired: false };
    m.claim.mockResolvedValue({ rows: [] });
    m.intent.mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [row] });
    expect(await botMatrixRun(123, { replace: true, operationId: 'free-A' })).toMatchObject({ ok: true, pending: true });
    row.expired = true;
    expect(await botMatrixRun(123, { replace: true, operationId: 'free-A' })).toMatchObject({ ok: false, error: 'not_available' });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.charge).not.toHaveBeenCalled();
  });
  it("does not reuse an operation for a different person", async () => {
    m.intent.mockResolvedValue({ rows: [{ input: { subjectId: 'other-person', toolId: 'child_matrix', birthDate: subject.birthDate },
      billing_required: false, status: 'pending', session_id: null, expired: false }] });
    expect(await botMatrixRun(123, { replace: true, operationId: 'free-A' })).toMatchObject({ ok: false, error: 'operation_failed' });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.charge).not.toHaveBeenCalled();
  });
  it("requires a new confirmation if birth changed before the original intent was charged", async () => {
    m.intent.mockResolvedValue({ rows: [{ input: { subjectId: subject.id, toolId: 'child_matrix', birthDate: '2014-01-02' },
      billing_required: true, status: 'pending', session_id: null, expired: false }] });
    expect(await botMatrixRun(123, { replace: true, operationId: 'paid-A' })).toMatchObject({ ok: false, error: 'operation_failed' });
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.charge).not.toHaveBeenCalled();
  });
  it("does not wipe the original session before rejecting a mismatched retry with a corrupted current report", async () => {
    m.usable.mockReturnValue(false);
    m.intent.mockResolvedValue({ rows: [{ input: { subjectId: 'other-person', toolId: 'child_matrix', birthDate: subject.birthDate },
      billing_required: false, status: 'pending', session_id: 'old-session', expired: false }] });
    expect(await botMatrixRun(123, { replace: false, operationId: 'free-A' })).toMatchObject({ ok: false, error: 'operation_failed' });
    expect(m.wipe).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
  });
});
