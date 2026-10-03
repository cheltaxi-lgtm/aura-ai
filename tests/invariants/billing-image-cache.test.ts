import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ profile: true, billingActive: true, worker: false, workerCharge: vi.fn(), recover: vi.fn(), charge: vi.fn(), refund: vi.fn(), generate: vi.fn(), saved: vi.fn(), find: vi.fn(), complete: vi.fn(), artifacts: new Map<string, string>() }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: async () => ({ sub: "account" }) }));
vi.mock("@/lib/accounts", () => ({ getProfileUserIdForAccount: async () => m.profile ? "profile" : null, resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/api-guards", () => ({ enforceImageGenRateLimit: async () => null }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => ({ enabled: true, scenes: { destiny_card: true, scene_illustration: true, final_report: true }, stylePrefix: "Synthetic style" }) }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true }), runeCostFromSettings: () => 20 }));
vi.mock("@/lib/rune-service", () => ({ isRuneBillingActive: () => m.billingActive }));
vi.mock("@/lib/image-gen", () => ({ isImageGenConfigured: () => true, generateSceneImage: m.generate }));
vi.mock("@/lib/scene-image-store", () => ({ normalizeSceneImageUrl: async (url: string) => url }));
vi.mock("@/lib/users", () => ({ findExistingSceneArtUrl: m.find, createHistoryEntry: m.saved }));
vi.mock("@/lib/async-job-worker-auth", () => ({ getAsyncJobWorkerUserId: () => m.worker ? "profile" : null,
  getReportWorkerJobFromRequest: () => m.worker ? { jobId: "job", attempt: { workerId: "worker", attemptCount: 1 } } : undefined, isAsyncJobWorkerConfigured: () => false }));
vi.mock("@/lib/async-job-lifecycle", () => ({ trackWorkerJobCompleted: m.complete, trackWorkerJobFailed: vi.fn(),
  chargeRuneActionForWorkerJob: m.workerCharge, refundWorkerJobCharge: async (_request: unknown, charge: unknown) => m.refund(charge) }));
vi.mock("@/lib/services/durable-report-receipt", () => ({ recoverSavedWorkerReport: m.recover }));
vi.mock("@/lib/services/history-product-receipt", () => ({ saveHistoryProductReceipt: async ({ history }: { history: unknown }) => m.saved(history) }));
vi.mock("@/lib/reading-lock", () => ({ withReadingLock: async (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/error-report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/services/billing-service", () => ({ BillingService: { chargeRuneAction: m.charge, rollbackChargeEx: m.refund },
  InsufficientFundsError: class extends Error {}, insufficientFundsResponse: vi.fn(),
  BillingIdempotencyConflictError: class extends Error {}, billingIdempotencyConflictResponse: vi.fn(),
  buildFallbackChargeIdempotencyKey: () => "legacy-fallback",
}));
import { POST } from "@/app/api/image/generate/route";
import { sceneImageResourceIdentity } from "@/lib/scene-image-identity";
import { spreadReadingResourceKey, readingPromptAstroMetadata } from "@/lib/reading-resource-identity";

const defaults = { scene: "destiny_card", characterKey: "veronika", userName: "Synthetic", zodiac: "Овен", cards: ["Солнце", "Маг", "Звезда"], spreadId: "triplet" };
function request(changes: Record<string, unknown> = {}, key = "client-key") { return new NextRequest("http://localhost/api/image/generate", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ ...defaults, ...changes }) }); }

describe("actual image route purchase and durable cache consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("SCENE_IMAGE_GENERATION_ENABLED", "true"); m.artifacts.clear(); m.worker = false; m.profile = true; m.billingActive = true; m.recover.mockResolvedValue(null);
    m.charge.mockResolvedValue({ transactionId: "paid-receipt", spentRunes: 20, actionType: "DESTINY_CARD", newBalance: 80 });
    m.workerCharge.mockResolvedValue({ transactionId: "worker-paid-receipt", spentRunes: 20, actionType: "DESTINY_CARD", newBalance: 80 });
    m.find.mockImplementation(async (_u, scene, _cards, opts) => m.artifacts.get(`${scene}:${opts.resourceIdentity}`) ?? null);
    m.saved.mockImplementation(async ({ contextData }) => { m.artifacts.set(`${contextData.scene}:${contextData.sceneImageResourceKey}`, contextData.sceneArt[contextData.scene]); return { id: "history-id" }; });
    m.generate.mockImplementation(async ({ scene }) => ({ imageUrl: `https://zovus.ru/api/scene-image/synthetic-${m.generate.mock.calls.length}`, scene, model: "synthetic", aspectRatio: "1:1", quality: "standard" }));
    m.refund.mockResolvedValue({ refunded: true, balance: 100 }); m.complete.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("same request with another client key returns one durable artifact without another provider/debit", async () => {
    const first = await POST(request()); const retry = await POST(request({}, "another-key"));
    expect(first.status).toBe(200); expect(await retry.json()).toMatchObject({ reused: true });
    expect(m.charge).toHaveBeenCalledOnce(); expect(m.generate).toHaveBeenCalledOnce(); expect(m.saved).toHaveBeenCalledOnce();
  });
  it.each([{ characterKey: "ragnar" }, { userName: "Other" }, { zodiac: "Телец" }, { cards: ["Маг", "Солнце", "Звезда"] }, { userQuestionText: "Другой вопрос" }])("same cards/raw key cannot substitute context %j", async changes => {
    await POST(request()); await POST(request(changes));
    expect(m.charge).toHaveBeenCalledTimes(2);
    expect(m.charge.mock.calls[0][0].idempotencyKey).not.toBe(m.charge.mock.calls[1][0].idempotencyKey);
    expect(m.generate).toHaveBeenCalledTimes(2);
  });
  it("Q&A scene art persists and retries the exact answer, while a new answer purchases a new artifact", async () => {
    const changes = { scene: "scene_illustration", userQuestionText: "Как начать?", aiResponseText: "Первый ответ" };
    await POST(request(changes)); expect((await (await POST(request(changes))).json()).reused).toBe(true);
    await POST(request({ ...changes, aiResponseText: "Второй ответ" }));
    expect(m.charge).toHaveBeenCalledTimes(2); expect(m.saved).toHaveBeenCalledTimes(2);
  });
  it("delivery metadata failure after durable save never refunds the available image", async () => {
    m.complete.mockRejectedValueOnce(new Error("synthetic_delivery_failure"));
    expect((await POST(request())).status).toBe(500); expect(m.refund).not.toHaveBeenCalled();
    expect((await (await POST(request())).json()).reused).toBe(true); expect(m.generate).toHaveBeenCalledOnce();
  });
  it("worker scene charge binds the owned job and exact content before the provider", async () => {
    m.worker = true;
    expect((await POST(request())).status).toBe(200);
    expect(m.charge).not.toHaveBeenCalled(); expect(m.workerCharge).toHaveBeenCalledOnce();
    expect(m.workerCharge.mock.calls[0][0]).toMatchObject({ userId: "profile", action: "DESTINY_CARD",
      operationIdentity: sceneImageResourceIdentity(defaults as Parameters<typeof sceneImageResourceIdentity>[0], "Synthetic style") });
    expect(m.saved.mock.calls[0][0].contextData.transactionId).toBe("worker-paid-receipt");
    expect(m.workerCharge.mock.invocationCallOrder[0]).toBeLessThan(m.generate.mock.invocationCallOrder[0]);
  });
  it("worker retries recover the durable paid artifact before another charge or provider", async () => {
    m.worker = true; m.recover.mockResolvedValue({ imageUrl: "https://zovus.ru/api/scene-image/owned", historyId: "owned-history" });
    expect(await (await POST(request())).json()).toMatchObject({ reused: true, historyId: "owned-history" });
    expect(m.workerCharge).not.toHaveBeenCalled(); expect(m.generate).not.toHaveBeenCalled();
  });
  it("failed worker synthesis refunds the job-owned receipt before final failure", async () => {
    m.worker = true; m.generate.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(502);
    expect(m.refund).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "worker-paid-receipt", userId: "profile" }));
    expect(m.saved).not.toHaveBeenCalled();
  });
  it("an authenticated account without a profile cannot bypass scene billing", async () => {
    m.profile = false;
    expect((await POST(request())).status).toBe(409); expect(m.generate).not.toHaveBeenCalled(); expect(m.charge).not.toHaveBeenCalled();
  });
  it("client isPaid cannot grant final-report access without server billing or entitlement", async () => {
    m.billingActive = false;
    expect((await POST(request({ scene: "final_report", isPaid: true }))).status).toBe(402);
    expect(m.generate).not.toHaveBeenCalled(); expect(m.charge).not.toHaveBeenCalled();
  });
  it.each([null, [], 123])("invalid body %j never reaches charge/provider", async body => {
    expect((await POST(new NextRequest("http://localhost/api/image/generate", { method: "POST", body: JSON.stringify(body) }))).status).toBe(400);
    expect(m.charge).not.toHaveBeenCalled(); expect(m.generate).not.toHaveBeenCalled();
  });
});

describe("semantic cache fingerprints", () => {
  const base = { profile: { name: "A", birthDate: "1990-01-01" }, cards: [{ name: "Маг", reversed: false }], question: "A", deck: "tarot", scope: "week", prompt: "version-one" };
  it.each([{ profile: { name: "B", birthDate: "1990-01-01" } }, { cards: [{ name: "Маг", reversed: true }] }, { question: "B" }, { deck: "runes" }, { scope: "month" }, { prompt: "version-two" }])("reading identity changes with semantic input %j", changes => {
    expect(spreadReadingResourceKey(base)).not.toBe(spreadReadingResourceKey({ ...base, ...changes }));
  });
  it("JSON field order and product anchors do not create a different reading intent", () => {
    expect(spreadReadingResourceKey({ a: 1, b: { c: 2, d: 3 } })).toBe(spreadReadingResourceKey({ b: { d: 3, c: 2 }, a: 1 }));
    expect(readingPromptAstroMetadata({ lifePath: 3, introReadingConsumedAt: "old" })).toEqual(readingPromptAstroMetadata({ lifePath: 3, introReadingConsumedAt: "new" }));
  });
  it("image aliases normalize, while a changed admin prompt creates a new resource", () => {
    const body = { ...defaults, scene: "destiny_card", characterKey: "baba_agafya" } as Parameters<typeof sceneImageResourceIdentity>[0];
    expect(sceneImageResourceIdentity(body, "style")).toBe(sceneImageResourceIdentity({ ...body, characterKey: "agafya" }, "style"));
    expect(sceneImageResourceIdentity(body, "style")).not.toBe(sceneImageResourceIdentity(body, "new style"));
  });
});
