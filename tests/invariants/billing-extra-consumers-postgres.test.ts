import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ userId: "", unlimited: false, speech: vi.fn(), memory: vi.fn() }));
vi.mock("@/lib/require-auth", () => ({ requireUserAuth: async () => ({ sub: "synthetic-account" }), resolveProfileUserContext: async () => ({ ok: true, auth: { sub: "synthetic-account" }, profileUserId: m.userId }) }));
vi.mock("@/lib/api-guards", () => ({ enforceTtsRateLimit: async () => null, enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/accounts", async original => ({ ...await original<typeof import("@/lib/accounts")>(), getProfileUserIdForAccount: async () => m.userId, resolveUnlimitedAccess: async () => m.unlimited }));
vi.mock("@/lib/settings", async original => ({ ...await original<typeof import("@/lib/settings")>(), isJointReadingEnabled: async () => true }));
vi.mock("@/lib/tts", () => ({ isTtsConfigured: () => true, isTtsEnabled: async () => true, synthesizeSpeech: m.speech }));
vi.mock("@/lib/memory/capture-helpers", async original => ({ ...await original<typeof import("@/lib/memory/capture-helpers")>(), captureJointInviteMemory: m.memory }));
import { query } from "@/lib/db";
import { POST as tts } from "@/app/api/tts/route";
import { POST as joint } from "@/app/api/joint-reading/create/route";
import { createJointReadingInvite } from "@/lib/joint-reading-service";
import { createAsyncJob, claimAsyncJobs, getAsyncJobById, markAsyncJobCharged } from "@/lib/async-jobs";
import { chargeRuneActionForWorkerJobById } from "@/lib/async-job-lifecycle";
import { BillingService, chargeForSession, rollbackChargeEx, BillingIdempotencyConflictError } from "@/lib/services/billing-service";
import { buildPhotoSpreadKey, buildLegacyPhotoSpreadKey } from "@/lib/photo-reading-idempotency";
import { clearTtsResultCacheForTests } from "@/lib/tts-result-cache";
import { createTestUser, countSpendTransactions, getUserBalance } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

function speechRequest(text = "Первый ответ", key = "same-client-key") { return new NextRequest("http://localhost/api/tts", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ text, characterId: "veronika" }) }); }
function jointRequest(changes: Record<string, unknown> = {}) { return new NextRequest("http://localhost/api/joint-reading/create", { method: "POST", body: JSON.stringify({ forceNew: true, partnerName: "Партнёр", spreadId: "love-7", idempotencyKey: "same-key", ...changes }) }); }
async function countInvites(userId: string) { return Number((await query("SELECT count(*)::int n FROM joint_readings WHERE initiator_user_id=$1", [userId])).rows[0].n); }
async function workerJob(userId: string) { const created = await createAsyncJob({ userId, kind: "reading", payload: { synthetic: randomUUID() } }); await claimAsyncJobs({ workerId: "synthetic-worker", kinds: ["reading"], limit: 10 }); return (await getAsyncJobById(created))!; }

describe.skipIf(!hasTestDb)("real TTS/joint/worker purchase consumers in PostgreSQL", () => {
  installDbLifecycle();
  beforeEach(() => { m.userId = ""; m.unlimited = false; vi.clearAllMocks(); clearTtsResultCacheForTests(); m.memory.mockResolvedValue(undefined); m.speech.mockImplementation(async (text, voice) => ({ buffer: Buffer.from(`${voice}:${text}`), contentType: "audio/mpeg", provider: "synthetic" })); });
  afterEach(() => clearTtsResultCacheForTests());

  it("different TTS text with one client key pays twice and returns its own audio", async () => {
    const user = await createTestUser({ runeBalance: 100 }); m.userId = user.id;
    expect(await (await tts(speechRequest())).text()).toBe("veronika:Первый ответ");
    expect(await (await tts(speechRequest("Другой ответ"))).text()).toBe("veronika:Другой ответ");
    expect(await getUserBalance(user.id)).toBe(96); expect(await countSpendTransactions(user.id)).toBe(2);
    expect(await (await tts(speechRequest("Другой ответ", "changed-client-key"))).text()).toBe("veronika:Другой ответ");
    expect(m.speech).toHaveBeenCalledTimes(2); expect(await getUserBalance(user.id)).toBe(96);
  });
  it("an account with no profile cannot synthesize free audio", async () => {
    m.userId = "";
    expect((await tts(speechRequest())).status).toBe(409); expect(m.speech).not.toHaveBeenCalled();
  });
  it("erasure accepted after real TTS debit prevents provider admission and returns that debit", async () => {
    const user = await createTestUser({ runeBalance: 100 }); m.userId = user.id;
    const original = BillingService.chargeForSession;
    const spy = vi.spyOn(BillingService, "chargeForSession").mockImplementation(async params => {
      const held = await original(params); await query("UPDATE users SET erasure_requested_at=now() WHERE id=$1", [user.id]); return held;
    });
    try {
      expect((await tts(speechRequest())).status).toBe(409); expect(m.speech).not.toHaveBeenCalled(); expect(await getUserBalance(user.id)).toBe(100);
    } finally { spy.mockRestore(); }
  });
  it("a truncated old photo purchase cannot authorize a different long question", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const spread = { deckType: "tarot", spreadType: "single", cards: [{ name: "Солнце", reversed: false }] } as Parameters<typeof buildPhotoSpreadKey>[1];
    const prefix = "А".repeat(200), question = `${prefix} Новый вопрос после старого префикса.`;
    const legacy = buildLegacyPhotoSpreadKey("veronika",spread,question), current = buildPhotoSpreadKey("veronika",spread,question);
    expect(current).not.toBe(legacy);
    await chargeForSession({ userId: user.id, cost: 30, actionType: "VISION_ANALYSIS", idempotencyKey: `photo-reading:${legacy}`, operationIdentity: `photo:${legacy}` });
    await expect(chargeForSession({ userId: user.id, cost: 30, actionType: "VISION_ANALYSIS", idempotencyKey: `photo-reading:${current}`,
      operationIdentity: `photo:${current}`, legacyIdempotencyKeys: [`photo-reading:${legacy}`] })).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    expect(await getUserBalance(user.id)).toBe(70); expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it("failed parallel TTS attempt refunds first, then retry recharges before producing paid audio", async () => {
    const user = await createTestUser({ runeBalance: 100 }); m.userId = user.id;
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    m.speech.mockImplementationOnce(async () => { await held; return null; });
    const first = tts(speechRequest()); await vi.waitFor(() => expect(m.speech).toHaveBeenCalledOnce(), { timeout: 15000 });
    const second = tts(speechRequest()); release();
    expect((await first).status).toBe(502); expect(await (await second).text()).toBe("veronika:Первый ответ");
    expect(await getUserBalance(user.id)).toBe(98); expect(await countSpendTransactions(user.id)).toBe(2);
    expect(Number((await query("SELECT count(*)::int n FROM rune_transactions WHERE user_id=$1 AND type='refund'", [user.id])).rows[0].n)).toBe(1);
  });
  it("parallel forceNew replay returns one receipt-owned joint invitation", async () => {
    const user = await createTestUser({ runeBalance: 100 }); m.userId = user.id;
    const responses = await Promise.all([joint(jointRequest()), joint(jointRequest()), joint(jointRequest())]);
    const payloads = await Promise.all(responses.map(r => { expect(r.status).toBe(200); return r.json(); }));
    expect(new Set(payloads.map(p => p.token)).size).toBe(1); expect(await countInvites(user.id)).toBe(1);
    expect(await getUserBalance(user.id)).toBe(80); expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it("different partner or explicit force nonce cannot reuse one joint purchase", async () => {
    const user = await createTestUser({ runeBalance: 100 }); m.userId = user.id;
    const first = await (await joint(jointRequest())).json();
    const other = await (await joint(jointRequest({ partnerName: "Другой партнёр" }))).json();
    const fresh = await (await joint(jointRequest({ idempotencyKey: "new-force-intent" }))).json();
    expect(new Set([first.token, other.token, fresh.token]).size).toBe(3); expect(await countInvites(user.id)).toBe(3);
    expect(await getUserBalance(user.id)).toBe(40); expect(await countSpendTransactions(user.id)).toBe(3);
  });
  it("unlimited force replay is stable without a ledger receipt", async () => {
    const user = await createTestUser(); m.userId = user.id; m.unlimited = true;
    const first = await (await joint(jointRequest())).json(), second = await (await joint(jointRequest())).json();
    expect(second.token).toBe(first.token); expect(await countInvites(user.id)).toBe(1); expect(await countSpendTransactions(user.id)).toBe(0);
  });
  it("secondary memory failure cannot refund a durable owned joint result", async () => {
    const user = await createTestUser({ runeBalance: 100 }); m.userId = user.id; m.memory.mockRejectedValue(new Error("synthetic_memory_failure"));
    expect((await joint(jointRequest())).status).toBe(200); expect(await countInvites(user.id)).toBe(1);
    expect(await getUserBalance(user.id)).toBe(80); expect(Number((await query("SELECT count(*)::int n FROM rune_transactions WHERE user_id=$1 AND type='refund'", [user.id])).rows[0].n)).toBe(0);
  });
  it("same result UUID cannot be reinterpreted as another owner's joint invite", async () => {
    const a = await createTestUser(), b = await createTestUser(), id = randomUUID();
    await createJointReadingInvite({ id, initiatorUserId: a.id, reuseExisting: false });
    await expect(createJointReadingInvite({ id, initiatorUserId: b.id, reuseExisting: false })).rejects.toThrow("joint_receipt_owner_conflict");
    expect(await countInvites(a.id)).toBe(1); expect(await countInvites(b.id)).toBe(0);
  });
  it("same running worker job charges once; another job purchases separately", async () => {
    const user = await createTestUser({ runeBalance: 100 }); const job = await workerJob(user.id);
    const calls = await Promise.all(Array.from({ length: 4 }, () => chargeRuneActionForWorkerJobById({ jobId: job.id, userId: user.id, action: "READING" })));
    expect(new Set(calls.map(c => c.transactionId)).size).toBe(1); expect(await getUserBalance(user.id)).toBe(90);
    const other = await workerJob(user.id); await chargeRuneActionForWorkerJobById({ jobId: other.id, userId: user.id, action: "READING" });
    expect(await getUserBalance(user.id)).toBe(80); expect(await countSpendTransactions(user.id)).toBe(2);
  });
  it("refunded worker receipt recharges and the job binds the new held UUID", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await workerJob(user.id);
    const args = { jobId: job.id, userId: user.id, action: "READING" as const };
    const first = await chargeRuneActionForWorkerJobById(args);
    await rollbackChargeEx({ userId: user.id, cost: 10, wasFreeQuestion: false, transactionId: first.transactionId });
    const second = await chargeRuneActionForWorkerJobById(args);
    expect(second.transactionId).not.toBe(first.transactionId); expect((await getAsyncJobById(job.id))?.charge_transaction_id).toBe(second.transactionId);
    expect(await getUserBalance(user.id)).toBe(90); expect(await countSpendTransactions(user.id)).toBe(2);
  });
  it("wrong action, missing job or foreign ownership cannot authorize a worker charge", async () => {
    const a = await createTestUser({ runeBalance: 100 }), b = await createTestUser({ runeBalance: 100 }), job = await workerJob(a.id);
    await chargeRuneActionForWorkerJobById({ jobId: job.id, userId: a.id, action: "READING" });
    await expect(chargeRuneActionForWorkerJobById({ jobId: job.id, userId: a.id, action: "VOICE_TTS" })).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    await expect(chargeRuneActionForWorkerJobById({ jobId: job.id, userId: b.id, action: "READING" })).rejects.toThrow("stale_async_job_attempt");
    await expect(chargeRuneActionForWorkerJobById({ jobId: randomUUID(), userId: a.id, action: "READING" })).rejects.toThrow("stale_async_job_attempt");
    expect(await getUserBalance(a.id)).toBe(90); expect(await getUserBalance(b.id)).toBe(100);
  });
  it("job ledger binder refuses switching a held receipt or binding another owner's receipt", async () => {
    const a = await createTestUser({ runeBalance: 100 }), b = await createTestUser({ runeBalance: 100 }), job = await workerJob(a.id);
    const first = await chargeRuneActionForWorkerJobById({ jobId: job.id, userId: a.id, action: "READING" });
    const foreign = await chargeForSession({ userId: b.id, cost: 10, actionType: "READING", idempotencyKey: "foreign" });
    await expect(markAsyncJobCharged(job.id, foreign.transactionId!)).rejects.toThrow("stale_or_conflicting_async_job_charge");
    expect((await getAsyncJobById(job.id))?.charge_transaction_id).toBe(first.transactionId);
  });
});
