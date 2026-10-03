import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ profile: true, active: true, charge: vi.fn(), rollback: vi.fn(), provider: vi.fn(), spent: new Set<string>(), unitCost: 2 }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: async () => ({ sub: "account" }) }));
vi.mock("@/lib/api-guards", () => ({ enforceTtsRateLimit: async () => null }));
vi.mock("@/lib/accounts", () => ({ getProfileUserIdForAccount: async () => m.profile ? "profile" : null, resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/active-profile", () => ({ withActiveProfile: async (_user: string, fn: (client: unknown) => Promise<unknown>) => m.active ? fn({}) : null }));
vi.mock("@/lib/tts", () => ({ isTtsConfigured: () => true, isTtsEnabled: async () => true, synthesizeSpeech: m.provider }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => ({ enabled: true }) }));
vi.mock("@/lib/chat-sanitize", () => ({ resolveApiCharacterId: async (value: string) => value || "veronika" }));
vi.mock("@/lib/voice-config", () => ({ isCharacterTtsEnabled: () => true }));
vi.mock("@/lib/rune-settings", () => ({ getRuneSettings: async () => ({ enabled: true }), runeCostFromSettings: () => m.unitCost }));
vi.mock("@/lib/rune-service", () => ({ isRuneBillingActive: () => true }));
vi.mock("@/lib/error-report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/reading-lock", () => ({ withReadingLock: async (_key: string, fn: () => Promise<unknown>) => fn() }));
vi.mock("@/lib/services/billing-service", () => ({
  BillingService: { chargeForSession: m.charge, rollbackCharge: m.rollback },
  InsufficientFundsError: class extends Error {}, insufficientFundsResponse: vi.fn(),
  BillingIdempotencyConflictError: class extends Error {}, billingIdempotencyConflictResponse: vi.fn(),
  readRequestChargeIdempotencyKey: (request: NextRequest, body: { idempotencyKey?: string }) => request.headers.get("Idempotency-Key") || body.idempotencyKey,
}));
import { POST } from "@/app/api/tts/route";
import { clearTtsResultCacheForTests, TTS_RESULT_CACHE_TTL_MS } from "@/lib/tts-result-cache";

function request(text: unknown, characterId = "veronika", key = "same-client-key") {
  return new NextRequest("http://localhost/api/tts", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ text, characterId, idempotencyKey: key }) });
}

describe("actual TTS route payload/payment/cache identity", () => {
  beforeEach(() => {
    vi.resetAllMocks(); clearTtsResultCacheForTests(); m.spent.clear(); m.unitCost = 2; m.profile = true; m.active = true;
    m.charge.mockImplementation(async ({ idempotencyKey }: { idempotencyKey: string }) => {
      const reused = m.spent.has(idempotencyKey); m.spent.add(idempotencyKey);
      return { transactionId: idempotencyKey, spentRunes: reused ? 0 : 2, deduplicated: reused, newBalance: 100 };
    });
    m.provider.mockImplementation(async (text: string, voice: string) => ({ buffer: Buffer.from(`${voice}:${text}`), contentType: "audio/mpeg", provider: "synthetic" }));
    m.rollback.mockResolvedValue(100);
  });
  afterEach(() => { clearTtsResultCacheForTests(); vi.useRealTimers(); });

  it("same raw key with different text returns correct new audio and pays separately", async () => {
    const first = await POST(request("Первый ответ"));
    const second = await POST(request("Другой ответ"));
    expect(await first.text()).toBe("veronika:Первый ответ"); expect(await second.text()).toBe("veronika:Другой ответ");
    expect(second.headers.get("X-TTS-Runes-Spent")).toBe("2");
    expect(m.spent.size).toBe(2); expect(m.provider).toHaveBeenCalledTimes(2);
  });

  it("same text with another voice never hits the first voice cache", async () => {
    await POST(request("Ответ", "veronika"));
    const next = await POST(request("Ответ", "evelina"));
    expect(await next.text()).toBe("evelina:Ответ"); expect(m.spent.size).toBe(2);
  });

  it("trimmed same purchase survives changed client keys and returns cache once", async () => {
    await POST(request("  Ответ  ", "veronika", "first"));
    const retry = await POST(request("Ответ", "veronika", "new"));
    expect(await retry.text()).toBe("veronika:Ответ"); expect(retry.headers.get("X-TTS-Deduplicated")).toBe("1");
    expect(m.spent.size).toBe(1); expect(m.provider).toHaveBeenCalledTimes(1);
  });

  it("different text after cache TTL still pays and cannot reuse the prior purchase", async () => {
    vi.useFakeTimers();
    await POST(request("Первый")); vi.advanceTimersByTime(TTS_RESULT_CACHE_TTL_MS + 1);
    const retry = await POST(request("Второй"));
    expect(await retry.text()).toBe("veronika:Второй"); expect(retry.headers.get("X-TTS-Deduplicated")).toBeNull();
    expect(m.spent.size).toBe(2);
  });

  it("cache loss for the same owned purchase may resynthesize without a second charge", async () => {
    await POST(request("Ответ")); clearTtsResultCacheForTests();
    const retry = await POST(request("Ответ"));
    expect(retry.headers.get("X-TTS-Deduplicated")).toBe("1"); expect(m.spent.size).toBe(1); expect(m.provider).toHaveBeenCalledTimes(2);
  });

  it("a price change preserves one already paid text/voice purchase", async () => {
    await POST(request("Ответ")); m.unitCost = 5;
    const replay = await POST(request("Ответ", "veronika", "changed-key"));
    expect(replay.headers.get("X-TTS-Deduplicated")).toBe("1");
    expect(m.spent.size).toBe(1); expect(m.provider).toHaveBeenCalledOnce();
    expect(m.charge.mock.calls[0][0].operationIdentity).toBe(m.charge.mock.calls[1][0].operationIdentity);
  });

  it("parallel same-purchase requests share one in-flight provider synthesis", async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    m.provider.mockImplementation(async () => { await held; return { buffer: Buffer.from("audio"), contentType: "audio/mpeg", provider: "synthetic" }; });
    const a = POST(request("Ответ")), b = POST(request("Ответ"));
    await vi.waitFor(() => expect(m.provider).toHaveBeenCalledTimes(1)); release();
    expect((await Promise.all([a, b])).every((response) => response.status === 200)).toBe(true);
    expect(m.spent.size).toBe(1); expect(m.provider).toHaveBeenCalledTimes(1);
  });

  it.each([null, true, {}, [], 123])("non-string payload %j never reaches billing or provider", async (text) => {
    expect((await POST(request(text))).status).toBe(400);
    expect(m.charge).not.toHaveBeenCalled(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("an account shell with no profile cannot synthesize or charge", async () => {
    m.profile = false; expect((await POST(request("Ответ"))).status).toBe(409);
    expect(m.charge).not.toHaveBeenCalled(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("erasure accepted while awaiting the purchase lock prevents any charge or synthesis", async () => {
    m.active = false; expect((await POST(request("Ответ"))).status).toBe(409);
    expect(m.charge).not.toHaveBeenCalled(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("erasure accepted after debit denies provider admission and returns its held charge", async () => {
    m.charge.mockImplementationOnce(async () => { m.active = false; return { transactionId: "held", spentRunes: 2 }; });
    expect((await POST(request("Ответ"))).status).toBe(409); expect(m.provider).not.toHaveBeenCalled();
    expect(m.rollback).toHaveBeenCalledWith(expect.objectContaining({ transactionId: "held", userId: "profile" }));
  });
});
