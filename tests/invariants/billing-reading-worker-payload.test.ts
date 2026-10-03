import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ workerCharge: vi.fn(), directCharge: vi.fn(), generate: vi.fn(), save: vi.fn(), recover: vi.fn(), complete: vi.fn(), refund: vi.fn() }));
vi.mock("@/lib/activation-telemetry", () => ({ observeProductRequest: async (_request: unknown, _product: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true, query: vi.fn(), queryClient: vi.fn(), withTransaction: vi.fn() }));
vi.mock("@/lib/users", () => ({ getUserById: async () => null, patchTripletInterpretation: async () => {}, createHistoryEntry: vi.fn() }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/memory/request-capture", () => ({ captureMemoryGenerationForRequest: async () => null }));
vi.mock("@/lib/memory/build-memory-context", () => ({ buildMemoryContext: async () => "", appendMemoryContextToPrompt: (prompt: string) => prompt }));
vi.mock("@/lib/guest-resume-billing", () => ({ resolveGuestResumeFreeReading: async () => null }));
vi.mock("@/lib/daily-spread-billing", () => ({ resolveDailyFreeReading: async () => null }));
vi.mock("@/lib/intro-triplet", () => ({ resolveIntroFreeReading: async () => null }));
vi.mock("@/lib/session-memory", () => ({ getSessionMemories: async () => [], countSessionMemories: async () => 0 }));
vi.mock("@/lib/prompts/natal-context", () => ({ buildNatalPromptContext: async () => "" }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => ({ model: "synthetic", paidModel: "synthetic" }) }));
vi.mock("@/lib/reading-idempotency", () => ({ findSpreadReadingEntry: async () => null, withSpreadReadingLock: async (_u: string, _c: string, _k: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/async-job-worker-auth", () => ({ getAsyncJobWorkerUserId: () => "profile", getAsyncJobIdFromRequest: () => "job",
  getAsyncJobAttemptFromRequest: () => ({ workerId: "worker", attemptCount: 1 }), getReportWorkerJobFromRequest: () => ({ jobId: "job", attempt: { workerId: "worker", attemptCount: 1 } }), isAsyncJobWorkerConfigured: () => true }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true, costs: { READING: 10 } }), runeCostFromSettings: () => 10 }));
vi.mock("@/lib/rune-service", () => ({ isRuneBillingActive: () => true }));
vi.mock("@/lib/async-job-lifecycle", () => ({ chargeRuneActionForWorkerJob: m.workerCharge, refundWorkerJobCharge: m.refund,
  beginWorkerJobSave: async () => true, trackWorkerJobCompleted: m.complete, trackWorkerJobFailed: vi.fn(), trackWorkerJobRefunded: vi.fn(), shouldRefundBeforeWorkerFail: async () => true }));
vi.mock("@/lib/services/billing-service", () => ({ BillingService: { chargeRuneAction: m.directCharge },
  InsufficientFundsError: class extends Error {}, BillingIdempotencyConflictError: class extends Error {}, buildFallbackChargeIdempotencyKey: () => "old", billingIdempotencyConflictResponse: vi.fn() }));
vi.mock("@/lib/services/durable-report-receipt", () => ({ recoverSavedWorkerReport: m.recover }));
vi.mock("@/lib/services/history-product-receipt", () => ({ saveHistoryProductReceipt: m.save }));
vi.mock("@/lib/chat-prompts", () => ({ buildCharacterPrompt: () => "Synthetic prompt", buildHumanReadingPrompt: () => "Synthetic prompt", generateReading: m.generate }));
vi.mock("@/lib/spread-reading-complete", () => ({ isPaidSpreadTextComplete: () => true }));
vi.mock("@/lib/spread-reading-persist", () => ({ ensureSpreadReadingInChatMessages: async () => null }));
vi.mock("@/lib/error-report", () => ({ reportError: vi.fn() }));
import { POST } from "@/app/api/reading/route";
const body = { userName: "Synthetic", birthDate: "1990-01-01", characterId: "veronika", spreadId: "triplet", customQuestion: "Как начать?",
  tarotCards: [{ name: "Солнце", meaning: "Свет" }, { name: "Маг", meaning: "Действие" }, { name: "Звезда", meaning: "Надежда" }] };
function request(changes: Record<string, unknown> = {}) { return new NextRequest("http://localhost/api/reading", { method: "POST", body: JSON.stringify({ ...body, ...changes }) }); }
describe("actual plain reading worker uses atomic purchase and history receipt adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks(); m.recover.mockResolvedValue(null);
    m.workerCharge.mockResolvedValue({ transactionId: "owned-job-receipt", spentRunes: 10, actionType: "READING", newBalance: 90 });
    m.generate.mockResolvedValue({ text: "Солнце показывает ясность выбранного направления и возможность открытого разговора. Маг предлагает сделать конкретный первый шаг и проверить результат действием. Звезда помогает сохранить надежду и спокойно выбирать посильную практику на ближайшее время.", fromLlm: true }); m.save.mockResolvedValue({ id: "owned-history" });
    m.refund.mockResolvedValue({ refunded: true, balance: 100 });
  });
  it("binds server content before generation and saves with the same job receipt", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(m.directCharge).not.toHaveBeenCalled(); expect(m.workerCharge).toHaveBeenCalledOnce();
    const purchase = m.workerCharge.mock.calls[0][0], save = m.save.mock.calls[0][0];
    expect(purchase).toMatchObject({ action: "READING", userId: "profile" }); expect(purchase.operationIdentity).toMatch(/^spread-resource:/);
    expect(save).toMatchObject({ transactionId: "owned-job-receipt", history: { userId: "profile", contextData: { readingResourceKey: purchase.operationIdentity, transactionId: "owned-job-receipt" } } });
    expect(m.workerCharge.mock.invocationCallOrder[0]).toBeLessThan(m.generate.mock.invocationCallOrder[0]);
  });
  it.each([{ customQuestion: "Как изменить работу?" }, { readingScope: "month" }, { tarotCards: [...body.tarotCards].reverse() }])("different accepted resource %j has different operation identity", async changes => {
    expect((await POST(request())).status).toBe(200); const first = m.workerCharge.mock.calls.at(-1)![0].operationIdentity;
    expect((await POST(request(changes))).status).toBe(200); expect(m.workerCharge.mock.calls.at(-1)![0].operationIdentity).not.toBe(first);
  });
  it("recovers a durable paid reading before touching provider or billing", async () => {
    m.recover.mockResolvedValue({ reading: "Сохранённый разбор", historyId: "stored" });
    expect(await (await POST(request())).json()).toMatchObject({ historyId: "stored", reused: true });
    expect(m.workerCharge).not.toHaveBeenCalled(); expect(m.generate).not.toHaveBeenCalled();
  });
});
