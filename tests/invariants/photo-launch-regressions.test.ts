import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  charge: vi.fn(), refund: vi.fn(), prior: vi.fn(), generate: vi.fn(), save: vi.fn(),
  find: vi.fn(), fromContext: vi.fn(), failed: vi.fn(), events: [] as string[],
  lockKeys: [] as string[], lockTail: Promise.resolve(), persisted: false,
}));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/settings", () => ({ isPhotoReadingEnabled: async () => true }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: async () => ({ sub: "account", name: "Test" }) }));
vi.mock("@/lib/age-gate", () => ({ AGE_REQUIRED_ERROR: {}, isUserAgeEligible: () => true }));
vi.mock("@/lib/accounts", () => ({ getProfileUserIdForAccount: async () => "profile", resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/users", () => ({ getUserById: async () => ({ id: "profile" }), serializeUserProfile: () => ({ name: "Test" }) }));
vi.mock("@/lib/session", () => ({ hasPaidAccess: () => false, getSession: vi.fn() }));
vi.mock("@/lib/session-access", () => ({ ensureChatSession: async () => ({ session: { id: "session" } }) }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/chat-sanitize", () => ({ resolveApiCharacterId: async () => "veronika", sanitizeTextField: (s: string) => s }));
vi.mock("@/lib/photo-reading-prompts", () => ({ resolvePhotoInterpretationPrompt: async () => "prompt" }));
vi.mock("@/lib/photo-spread-redraw", () => ({
  normalizeRedrawSpreadInput: (s: unknown) => s, isPhotoSpreadComplete: () => true,
  isRecognizedSpread: () => ({ ok: true }), buildSpreadSummaryForLlm: () => "spread", redrawSpreadToTarotCards: () => [],
}));
vi.mock("@/lib/memory/build-memory-context", () => ({ buildMemoryContext: async () => null, appendMemoryContextToPrompt: (s: string) => s }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true }) }));
vi.mock("@/lib/rune-service", () => ({ isRuneBillingActive: () => true }));
vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { chargeForSession: m.charge, rollbackChargeEx: m.refund },
  InsufficientFundsError: class extends Error {}, insufficientFundsResponse: vi.fn(),
}));
vi.mock("@/lib/photo-reading-billing", () => ({ resolvePhotoReadingPricing: async () => ({ effectiveCost: 30, firstPhotoDiscount: false }) }));
vi.mock("@/lib/photo-reading-idempotency", () => ({
  buildPhotoSpreadKey: () => "spread-key", findPhotoReadingEntry: m.find,
  getPhotoChargeReuseState: m.prior,
  withPhotoReadingLock: async (_user: string, key: string, fn: () => Promise<unknown>) => {
    m.lockKeys.push(key);
    const previous = m.lockTail;
    let release = () => {};
    m.lockTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await fn(); } finally { m.events.push("unlock"); release(); }
  },
}));
vi.mock("@/lib/photo-reading-persist", () => ({ persistPhotoReadingResult: m.save, photoReadingJsonFromContext: m.fromContext }));
vi.mock("@/lib/async-job-worker-auth", () => ({ getAsyncJobWorkerUserId: () => null, isAsyncJobWorkerConfigured: () => false }));
vi.mock("@/lib/async-job-enqueue", () => ({ enqueuePaidAsyncJob: vi.fn() }));
vi.mock("@/lib/async-job-lifecycle", () => ({
  beginWorkerJobSave: async () => true, trackWorkerJobCharged: async () => {}, trackWorkerJobCompleted: async () => {}, trackWorkerJobFailed: m.failed,
}));
vi.mock("@/lib/photo-reading-stream", () => ({
  createPhotoInterpretationJson: m.generate,
  createPhotoInterpretationStream: async ({ onComplete }: { onComplete: (result: { reply: string; llmFailed: boolean }) => Promise<unknown> }) => new Response(new ReadableStream({
    async start(controller) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      await onComplete({ reply: "saved legacy reading", llmFailed: false });
      controller.enqueue(new TextEncoder().encode("data: done\n\n"));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } }),
}));
import { POST } from "@/app/api/photo-reading/stream/route";

function request(async = true, idempotencyKey = "photo-key") {
  return new NextRequest("http://localhost/api/photo-reading/stream", { method: "POST", body: JSON.stringify({
    async, question: "test", idempotencyKey, confirmedSpread: { cards: [{ name: "Солнце" }], deckType: "tarot", spreadType: "single" },
  }) });
}

describe("photo delivery and refund regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.events.length = 0;
    m.lockKeys.length = 0;
    m.lockTail = Promise.resolve();
    m.persisted = false;
    m.charge.mockReset().mockResolvedValue({ spentRunes: 30, newBalance: 270, wasFreeQuestion: false, transactionId: "charge-1" });
    m.refund.mockReset().mockResolvedValue({ balance: 300, refunded: true });
    m.generate.mockReset().mockResolvedValue({ reply: "saved reading", llmFailed: false });
    m.find.mockReset().mockResolvedValue(null);
    m.fromContext.mockReset().mockReturnValue({ analysis: "saved reading", saved: true, historyId: "history", cached: true });
    m.save.mockImplementation(async () => { m.events.push("save"); m.persisted = true; return "history"; });
  });
  it("returns a saved JSON result for async clients when the worker is unavailable", async () => {
    const response = await POST(request());
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ analysis: "saved reading", saved: true, historyId: "history" });
  });
  it.each([true, false])("reports only the confirmed refund outcome: %s", async (refunded) => {
    m.generate.mockResolvedValue({ reply: "", llmFailed: true });
    m.refund.mockResolvedValue({ balance: refunded ? 300 : 270, refunded });
    const response = await POST(request());
    const body = await response.json();
    expect(body.refunded).toBe(refunded);
    expect(m.refund).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "charge-1", cost: 30 }));
    expect(m.failed).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.objectContaining({ refunded }));
    if (!refunded) expect(body.error).not.toContain("Руны возвращены");
  });
  it("resumes an unrefunded charge without another debit or a permanent pending response", async () => {
    m.charge.mockResolvedValue({ spentRunes: 0, newBalance: 270, transactionId: "charge-1", deduplicated: true });
    m.prior.mockResolvedValue({ transactionId: "charge-1", amount: 30, refunded: false, retryPrefix: "photo-retry:charge-1:" });
    expect(await (await POST(request())).json()).toMatchObject({ analysis: "saved reading" });
    expect(m.charge).toHaveBeenCalledTimes(1);
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ spentRunes: 30 }));
  });
  it("starts a new tracked charge after a confirmed refund", async () => {
    m.charge.mockResolvedValueOnce({ spentRunes: 0, newBalance: 300, transactionId: "charge-1", deduplicated: true })
      .mockResolvedValueOnce({ spentRunes: 30, newBalance: 270, transactionId: "charge-2", deduplicated: false });
    m.prior.mockResolvedValue({ transactionId: "charge-1", amount: 30, refunded: true, retryPrefix: "photo-retry:charge-1:" });
    expect(await (await POST(request())).json()).toMatchObject({ analysis: "saved reading" });
    expect(m.charge).toHaveBeenLastCalledWith(expect.objectContaining({ idempotencyKey: expect.stringMatching(/^photo-retry:charge-1:/) }));
  });
  it("keeps the legacy SSE lock until its completion callback saves the result", async () => {
    const response = await POST(request(false));
    expect(await response.text()).toContain("data: done");
    expect(m.events).toEqual(["save", "unlock"]);
  });
  it("serializes two browser keys for the same spread and charges only once", async () => {
    m.find.mockImplementation(async () => m.persisted
      ? { id: "history", context_data: { analysis: "saved reading" }, is_paid: true, created_at: new Date() }
      : null);
    const [first, second] = await Promise.all([
      POST(request(true, "browser-key-before-reload")),
      POST(request(true, "browser-key-after-reload")),
    ]);
    expect(await first.json()).toMatchObject({ analysis: "saved reading" });
    expect(await second.json()).toMatchObject({ analysis: "saved reading" });
    expect(m.lockKeys).toEqual(["spread-key", "spread-key"]);
    expect(m.charge).toHaveBeenCalledTimes(1);
    expect(m.charge).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "photo-reading:spread-key",
    }));
  });
});
