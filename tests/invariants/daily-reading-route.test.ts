import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), charge: vi.fn(), latest: vi.fn(), intro: vi.fn(), introConsumed: vi.fn(), findReading: vi.fn() }));
vi.mock("@/lib/require-auth", () => ({ resolveProfileUserContext: async () => ({ ok: true, auth: { sub: "account" }, profileUserId: "profile" }), profileAuthFailureResponse: vi.fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => false, query: vi.fn(), withTransaction: vi.fn(), queryClient: vi.fn() }));
vi.mock("@/lib/users", () => ({ getUserById: async () => null, getLatestDailyTripletHistory: mocks.latest, createHistoryEntry: vi.fn(), patchTripletInterpretation: vi.fn() }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/memory/request-capture", () => ({ captureMemoryGenerationForRequest: async () => 0 }));
vi.mock("@/lib/guest-resume-billing", () => ({ resolveGuestResumeFreeReading: async () => null }));
vi.mock("@/lib/intro-triplet", () => ({ resolveIntroFreeReading: mocks.intro }));
vi.mock("@/lib/rate-limit-anchors", () => ({ profileHasIntroReadingConsumed: mocks.introConsumed, recordIntroReadingConsumed: vi.fn() }));
vi.mock("@/lib/reading-idempotency", () => ({ findSpreadReadingEntry: mocks.findReading, withSpreadReadingLock: vi.fn() }));
vi.mock("@/lib/async-job-worker-auth", () => ({ getAsyncJobWorkerUserId: () => null, isAsyncJobWorkerConfigured: () => true, getAsyncJobIdFromRequest: () => null }));
vi.mock("@/lib/async-job-enqueue", () => ({ enqueuePaidAsyncJob: mocks.enqueue }));
vi.mock("@/lib/services/billing-service", () => ({ BillingService: { chargeRuneAction: mocks.charge }, InsufficientFundsError: class extends Error {}, insufficientFundsResponse: vi.fn() }));
import { POST } from "@/app/api/reading/route";

beforeEach(() => { vi.clearAllMocks(); mocks.latest.mockResolvedValue(null); mocks.intro.mockResolvedValue(null); mocks.introConsumed.mockResolvedValue(false); mocks.findReading.mockResolvedValue(null); });
describe("forged daily request cannot enqueue or debit", () => {
  it("normalizes an accepted daily job to today's scope and server cards", async () => {
    mocks.latest.mockResolvedValue({ id: "daily-artifact", created_at: new Date(), context_data: { type: "daily_triplet", masterId: "veronika", deckSystem: "tarot-veronika", tarotCards: [{ id:0, name:"Шут", position:0, reversed:false }, { id:1, name:"Маг", position:1, reversed:true }, { id:2, name:"Жрица", position:2, reversed:false }] } });
    mocks.enqueue.mockResolvedValue(NextResponse.json({ jobId: "job" }, { status:202 }));
    const response = await POST(new NextRequest("https://zovus.ru/api/reading", { method:"POST", body:JSON.stringify({ characterId:"veronika", spreadType:"daily", spreadId:"celtic_cross", readingScope:"month", forceRegenerate:true, async:true, tarotCards:[{ name:"Шут", meaning:"arbitrary client instruction" },{ name:"Маг" },{ name:"Жрица" }] }) }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ payload:expect.objectContaining({ readingScope:"today", spreadId:"triplet", spreadType:"daily", forceRegenerate:false }) }));
    const cards=mocks.enqueue.mock.calls[0][0].payload.tarotCards;
    expect(cards[0].meaning).not.toBe("arbitrary client instruction");
    expect(cards[1]).toMatchObject({ name:"Маг", reversed:true });
    expect(mocks.charge).not.toHaveBeenCalled();
  });
  it.each([false, true])("rejects a synchronous/asynchronous request (async=%s) before side effects", async (async) => {
    const response = await POST(new NextRequest("https://zovus.ru/api/reading", {
      method: "POST",
      body: JSON.stringify({ characterId: "veronika", spreadType: "daily", tarotCards: [{ name: "Шут" }, { name: "Маг" }, { name: "Жрица" }], async }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "DAILY_READING_UNAVAILABLE" });
    expect(mocks.latest).toHaveBeenCalledWith("profile");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });
});

describe("intro reading authority", () => {
  const requestedCards = [{ name: "Шут" }, { name: "Маг" }, { name: "Жрица" }];

  it("rejects a forged intro without an owned artifact before enqueue or charge", async () => {
    const response = await POST(new NextRequest("https://zovus.ru/api/reading", {
      method: "POST", body: JSON.stringify({ characterId: "veronika", spreadType: "intro", tarotCards: requestedCards, async: true }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "INTRO_READING_UNAVAILABLE" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("normalizes the owned intro to the timeless triplet and server cards", async () => {
    mocks.intro.mockResolvedValue({
      cards: requestedCards.map((card, id) => ({ id, name: card.name, meaning: "server meaning", reversed: false })),
      cardsKey: "intro:owned",
    });
    mocks.enqueue.mockResolvedValue(NextResponse.json({ jobId: "job" }, { status: 202 }));
    const response = await POST(new NextRequest("https://zovus.ru/api/reading", {
      method: "POST", body: JSON.stringify({
        characterId: "veronika", spreadType: "intro", spreadId: "celtic_cross",
        readingScope: "today", forceRegenerate: true, async: true,
        tarotCards: requestedCards.map(card => ({ ...card, meaning: "client injection" })),
      }),
    }));
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({
      spreadType: "intro", spreadId: "triplet", readingScope: "", forceRegenerate: false,
    }) }));
    expect(mocks.enqueue.mock.calls[0][0].payload.tarotCards[0].meaning).toBe("server meaning");
    expect(mocks.charge).not.toHaveBeenCalled();
  });

  it("does not enqueue a second intro after the first result was consumed and erased", async () => {
    mocks.intro.mockResolvedValue({ cards: requestedCards, cardsKey: "intro:owned" });
    mocks.introConsumed.mockResolvedValue(true);
    const response = await POST(new NextRequest("https://zovus.ru/api/reading", {
      method: "POST", body: JSON.stringify({ characterId: "veronika", spreadType: "intro", tarotCards: requestedCards, async: true }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "INTRO_ALREADY_READ" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.charge).not.toHaveBeenCalled();
  });
});
