import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  charge: vi.fn(), refund: vi.fn(), prior: vi.fn(), generate: vi.fn(), save: vi.fn(), find: vi.fn(),
  events: [] as string[],
}));
vi.mock("@/lib/db", () => ({ ensureDb: async () => true }));
vi.mock("@/lib/telegram/bot-resolve", () => ({ resolveBotUser: async () => ({
  linked: true, accountId: "account", profileUserId: "profile", name: "Test", runeBalance: 300,
}) }));
vi.mock("@/lib/age-gate", () => ({ isUserAgeEligible: () => true }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/users", () => ({ getUserById: async () => ({ id: "profile" }), serializeUserProfile: () => ({ name: "Test" }) }));
vi.mock("@/lib/cabinet-data", () => ({ deleteCabinetPhotoSpread: vi.fn(), getCabinetPhotoSpreads: vi.fn() }));
vi.mock("@/lib/api-guards", () => ({ MAX_IMAGE_BYTES: 5_000_000, validateImageBase64Payload: vi.fn(), validateImageMime: vi.fn() }));
vi.mock("@/lib/session", () => ({ hasPaidAccess: () => false }));
vi.mock("@/lib/session-access", () => ({ ensureChatSession: async () => ({ session: { id: "session" } }) }));
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
  InsufficientFundsError: class extends Error {},
}));
vi.mock("@/lib/photo-reading-billing", () => ({ resolvePhotoReadingPricing: async () => ({ effectiveCost: 30, firstPhotoDiscount: false }) }));
vi.mock("@/lib/photo-reading-idempotency", () => ({
  buildPhotoSpreadKey: () => "spread-key", findPhotoReadingEntry: m.find, getPhotoChargeReuseState: m.prior,
  withPhotoReadingLock: async (_user: string, _key: string, fn: () => Promise<unknown>) => {
    try { return await fn(); } finally { m.events.push("unlock"); }
  },
}));
vi.mock("@/lib/photo-reading-persist", () => ({
  persistPhotoReadingResult: m.save,
  photoReadingJsonFromContext: (context: unknown) => context,
}));
vi.mock("@/lib/photo-reading-stream", () => ({ createPhotoInterpretationJson: m.generate }));

import { botPhotoInterpret } from "@/lib/telegram/bot-photo-service";

const input: Parameters<typeof botPhotoInterpret>[0] = {
  telegramUserId: 42, idempotencyKey: "telegram-photo-key", question: "test",
  confirmedSpread: { system: "tarot-veronika", deckType: "tarot", spreadType: "single", cards: [{
    name: "Солнце", originalName: "Солнце", reversed: false, position: "1", imagePath: "",
    shortMeaning: "", placeholder: false, order: 0,
  }] },
};

describe("Telegram photo retry and refund regressions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.events.length = 0;
    m.charge.mockResolvedValue({ spentRunes: 30, newBalance: 270, wasFreeQuestion: false, transactionId: "charge-1" });
    m.refund.mockResolvedValue({ balance: 300, refunded: true });
    m.generate.mockResolvedValue({ reply: "saved reading", llmFailed: false });
    m.find.mockResolvedValue(null);
    m.save.mockImplementation(async () => { m.events.push("save"); return "history"; });
  });

  it.each([true, false])("reports the confirmed refund outcome: %s", async (refunded) => {
    m.generate.mockResolvedValue({ reply: "", llmFailed: true });
    m.refund.mockResolvedValue({ balance: refunded ? 300 : 270, refunded });
    const result = await botPhotoInterpret(input);
    expect(result).toMatchObject({ ok: false, error: "generation_failed", refunded, runeBalance: refunded ? 300 : 270 });
    expect(m.refund).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "charge-1", cost: 30 }));
    expect("message" in result && result.message.includes("Руны возвращены")).toBe(refunded);
  });

  it("does not promise a refund when the refund operation throws", async () => {
    m.generate.mockRejectedValue(new Error("provider unavailable"));
    m.refund.mockRejectedValue(new Error("refund unavailable"));
    const result = await botPhotoInterpret(input);
    expect(result).toMatchObject({ ok: false, refunded: false, runeBalance: 270 });
    expect("message" in result && result.message).not.toContain("Руны возвращены");
  });

  it("resumes the existing spend without another debit and saves before unlocking", async () => {
    m.charge.mockResolvedValue({ spentRunes: 0, newBalance: 270, wasFreeQuestion: false, transactionId: "charge-1", deduplicated: true });
    m.prior.mockResolvedValue({ transactionId: "charge-1", amount: 30, refunded: false, retryPrefix: "photo-retry:charge-1:" });
    expect(await botPhotoInterpret(input)).toMatchObject({ ok: true, analysis: "saved reading", historyId: "history", charged: 0 });
    expect(m.charge).toHaveBeenCalledTimes(1);
    expect(m.prior).toHaveBeenCalledWith("profile", "charge-1");
    expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ spentRunes: 30, isPaid: true }));
    expect(m.events).toEqual(["save", "unlock"]);
  });

  it("uses a stable spread billing key when the client does not supply one", async () => {
    expect(await botPhotoInterpret({ ...input, idempotencyKey: undefined })).toMatchObject({ ok: true });
    expect(m.charge).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "tg-photo:spread-key" }));
  });

  it("refunds the latest unrefunded retry transaction, not its already refunded root", async () => {
    m.charge.mockResolvedValue({ spentRunes: 0, newBalance: 270, wasFreeQuestion: false, transactionId: "charge-1", deduplicated: true });
    m.prior.mockResolvedValue({ transactionId: "charge-2", amount: 30, refunded: false, retryPrefix: "photo-retry:charge-1:" });
    m.generate.mockResolvedValue({ reply: "", llmFailed: true });
    expect(await botPhotoInterpret(input)).toMatchObject({ ok: false, refunded: true });
    expect(m.charge).toHaveBeenCalledTimes(1);
    expect(m.refund).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "charge-2", cost: 30 }));
  });

  it("starts a tracked retry after a confirmed refund and refunds that retry on failure", async () => {
    m.charge.mockResolvedValueOnce({ spentRunes: 0, newBalance: 300, wasFreeQuestion: false, transactionId: "charge-1", deduplicated: true })
      .mockResolvedValueOnce({ spentRunes: 30, newBalance: 270, wasFreeQuestion: false, transactionId: "charge-2" });
    m.prior.mockResolvedValue({ transactionId: "charge-1", amount: 30, refunded: true, retryPrefix: "photo-retry:charge-1:" });
    m.generate.mockResolvedValue({ reply: "", llmFailed: true });
    expect(await botPhotoInterpret(input)).toMatchObject({ ok: false, refunded: true });
    expect(m.charge).toHaveBeenCalledTimes(2);
    expect(m.charge).toHaveBeenLastCalledWith(expect.objectContaining({ cost: 30, idempotencyKey: expect.stringMatching(/^photo-retry:charge-1:/) }));
    expect(m.refund).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "charge-2", cost: 30 }));
  });

  it("returns an existing saved result without generating or debiting", async () => {
    m.find.mockResolvedValue({ id: "saved-history", context_data: { analysis: "existing reading", detectedCards: ["Солнце"] } });
    expect(await botPhotoInterpret(input)).toMatchObject({ ok: true, cached: true, charged: 0, analysis: "existing reading" });
    expect(m.charge).not.toHaveBeenCalled();
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.refund).not.toHaveBeenCalled();
  });
});
