import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({ enqueue: vi.fn(), charge: vi.fn(), latest: vi.fn() }));
vi.mock("@/lib/require-auth", () => ({ resolveProfileUserContext: async () => ({ ok: true, auth: { sub: "account" }, profileUserId: "profile" }), profileAuthFailureResponse: vi.fn() }));
vi.mock("@/lib/db", () => ({ ensureDb: async () => false, query: vi.fn(), withTransaction: vi.fn(), queryClient: vi.fn() }));
vi.mock("@/lib/users", () => ({ getUserById: async () => null, getLatestDailyTripletHistory: mocks.latest, createHistoryEntry: vi.fn(), patchTripletInterpretation: vi.fn() }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/memory/request-capture", () => ({ captureMemoryGenerationForRequest: async () => 0 }));
vi.mock("@/lib/guest-resume-billing", () => ({ resolveGuestResumeFreeReading: async () => null }));
vi.mock("@/lib/async-job-worker-auth", () => ({ getAsyncJobWorkerUserId: () => null, isAsyncJobWorkerConfigured: () => true, getAsyncJobIdFromRequest: () => null }));
vi.mock("@/lib/async-job-enqueue", () => ({ enqueuePaidAsyncJob: mocks.enqueue }));
vi.mock("@/lib/services/billing-service", () => ({ BillingService: { chargeRuneAction: mocks.charge }, InsufficientFundsError: class extends Error {}, insufficientFundsResponse: vi.fn() }));
import { POST } from "@/app/api/reading/route";

beforeEach(() => { vi.clearAllMocks(); mocks.latest.mockResolvedValue(null); });
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
