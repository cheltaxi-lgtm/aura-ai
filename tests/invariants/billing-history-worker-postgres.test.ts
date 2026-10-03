import { createHash, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/image-gen", () => ({ isImageGenConfigured: () => true, generateSceneImage: m.generate }));
vi.mock("@/lib/scene-image-store", () => ({ normalizeSceneImageUrl: async (url: string) => url }));
vi.mock("@/lib/settings", async original => ({ ...await original<typeof import("@/lib/settings")>(), getSetting: async (key: string) => key === "visual"
  ? { enabled: true, scenes: { destiny_card: true }, stylePrefix: "Synthetic style" } : key === "runes" ? { enabled: true, costs: {} } : {} }));
vi.mock("@/lib/accounts", async original => ({ ...await original<typeof import("@/lib/accounts")>(), resolveUnlimitedAccess: async () => false }));
vi.mock("@/lib/error-report", () => ({ reportError: vi.fn() }));
import { query } from "@/lib/db";
import { createHistoryEntry } from "@/lib/users";
import { POST as image } from "@/app/api/image/generate/route";
import { createAsyncJob, claimAsyncJobs, getAsyncJobById, markAsyncJobCharged, failAsyncJobAndRefundIfCharged, reapWatchdogRunningAsyncJobs, type AsyncJobRow } from "@/lib/async-jobs";
import { chargeRuneActionForWorkerJob, chargeForCurrentWorkerJob, refundWorkerJobCharge } from "@/lib/async-job-lifecycle";
import { createJointReadingInviteReceipt } from "@/lib/services/joint-reading-receipt";
import { createJointReadingInvite } from "@/lib/joint-reading-service";
import { saveHistoryProductReceipt } from "@/lib/services/history-product-receipt";
import { sceneImageResourceIdentity } from "@/lib/scene-image-identity";
import { chargeForSession, BillingIdempotencyConflictError } from "@/lib/services/billing-service";
import { createTestUser, countSpendTransactions, getUserBalance } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const body = { scene: "destiny_card", characterKey: "veronika", userName: "Synthetic", cards: ["Маг"], spreadId: "one" };
async function jobFor(userId: string, kind: "reading" | "image_generate" = "reading") {
  const id = await createAsyncJob({ userId, kind, payload: { ...body, operation: randomUUID() } });
  await claimAsyncJobs({ workerId: "synthetic-worker", kinds: [kind], limit: 10 });
  return (await getAsyncJobById(id))!;
}
function request(job: AsyncJobRow, changes: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/image/generate", { method: "POST", headers: {
    host: "localhost", "x-async-job-worker-secret": "synthetic-worker-secret", "x-async-job-user-id": job.user_id,
    "x-async-job-id": job.id, "x-async-job-attempt": String(job.attempt_count), "x-async-job-worker-id": job.worker_id!,
  }, body: JSON.stringify({ ...body, ...changes }) });
}
function history(userId: string, kind: "reading" | "scene_image" = "reading") {
  return { userId, characterName: "veronika", isPaid: true, contextData: kind === "reading"
    ? { type: "reading", readingResourceKey: "spread-resource:synthetic", reading: "Сохранённая синтетическая трактовка", source: "ai", spreadId: "triplet" }
    : { type: "scene_image", sceneImageResourceKey: "image-resource:synthetic", scene: "destiny_card", sceneArt: { destiny_card: "https://zovus.ru/api/scene-image/synthetic" } } };
}
async function countHistory(userId: string) { return Number((await query("SELECT count(*)::int n FROM history WHERE user_id=$1", [userId])).rows[0].n); }

describe.skipIf(!hasTestDb)("reading/image owned job payment and durable artifact fence in PostgreSQL", () => {
  installDbLifecycle();
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv("ASYNC_JOB_WORKER_SECRET", "synthetic-worker-secret"); vi.stubEnv("SCENE_IMAGE_GENERATION_ENABLED", "true");
    m.generate.mockResolvedValue({ imageUrl: "https://zovus.ru/api/scene-image/synthetic", scene: "destiny_card", model: "synthetic", aspectRatio: "1:1", quality: "standard" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["AURA_READING", "PALM_READING", "VISION_ANALYSIS", "JOINT_READING"] as const)("%s custom charge and binding are atomic, replay preserves the discount and stale attempts cannot debit", async action => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const args = { request: request(job), params: { userId: user.id, cost: 7, actionType: action,
      idempotencyKey: `synthetic-custom:${job.id}`, operationIdentity: `synthetic-resource:${job.id}` } };
    const first = await chargeForCurrentWorkerJob(args), retry = await chargeForCurrentWorkerJob(args);
    expect(retry).toMatchObject({ transactionId: first.transactionId, spentRunes: 7 });
    expect((await getAsyncJobById(job.id))!).toMatchObject({ billing_state: "charged", charge_transaction_id: first.transactionId });
    expect(await getUserBalance(user.id)).toBe(93); expect(await countSpendTransactions(user.id)).toBe(1);
    const stale = await jobFor(user.id);
    await query("UPDATE async_jobs SET status='failed',worker_id=NULL WHERE id=$1", [stale.id]);
    await expect(chargeForCurrentWorkerJob({ request: request(stale), params: { ...args.params, idempotencyKey: `stale:${stale.id}` } })).rejects.toThrow("stale_async_job_attempt");
    expect(await getUserBalance(user.id)).toBe(93); expect(await countSpendTransactions(user.id)).toBe(1);
  });

  it("joint invitation and completed worker delivery commit together and resist a failure refund", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const held = await chargeForCurrentWorkerJob({ request: request(job), params: { userId: user.id, cost: 7,
      actionType: "JOINT_READING", idempotencyKey: `joint:${job.id}`, operationIdentity: `joint:${job.id}` } });
    const payload = await createJointReadingInviteReceipt({ request: request(job), transactionId: held.transactionId,
      params: { id: held.transactionId!, initiatorUserId: user.id, partnerName: "Синтетический партнёр", reuseExisting: false, runeCharged: true } });
    expect(typeof payload.token).toBe("string");
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "completed", billing_state: "completed", result: { token: payload.token } });
    expect(await refundWorkerJobCharge(request(job), { userId: user.id, cost: 7, wasFreeQuestion: false, transactionId: held.transactionId })).toMatchObject({ refunded: false });
    expect(await getUserBalance(user.id)).toBe(93);
  });

  it("watchdog recovers a joint invitation saved before old worker completion", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const held = await chargeForCurrentWorkerJob({ request: request(job), params: { userId: user.id, cost: 7,
      actionType: "JOINT_READING", idempotencyKey: `joint-old:${job.id}`, operationIdentity: `joint-old:${job.id}` } });
    const invite = await createJointReadingInvite({ id: held.transactionId!, initiatorUserId: user.id, reuseExisting: false, runeCharged: true });
    await query("UPDATE async_jobs SET started_at=now()-interval '20 minutes',locked_at=now()-interval '20 minutes' WHERE id=$1", [job.id]);
    await reapWatchdogRunningAsyncJobs({ maxRunningMs: 300000, maxAttempts: 1, kinds: [job.kind] });
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "completed", billing_state: "completed", result: { token: invite.token } });
    expect(await getUserBalance(user.id)).toBe(93);
    expect(Number((await query("SELECT count(*)::int n FROM rune_transactions WHERE user_id=$1 AND type='refund'", [user.id])).rows[0].n)).toBe(0);
  });

  it("another Aura artifact cannot prove delivery for a different charged receipt", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    await chargeForCurrentWorkerJob({ request: request(job), params: { userId: user.id, cost: 7,
      actionType: "AURA_READING", idempotencyKey: `aura-missing:${job.id}`, operationIdentity: `aura-missing:${job.id}` } });
    await createHistoryEntry({ userId: user.id, characterName: "numerolog", isPaid: true,
      contextData: { type: "aura_reading", auraSnapshotId: "unrelated-snapshot", report: "Другой сохранённый отчёт", transactionId: randomUUID() } });
    await query("UPDATE async_jobs SET started_at=now()-interval '20 minutes',locked_at=now()-interval '20 minutes' WHERE id=$1", [job.id]);
    await reapWatchdogRunningAsyncJobs({ maxRunningMs: 300000, maxAttempts: 1, kinds: [job.kind] });
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "failed", billing_state: "refunded" });
    expect(await getUserBalance(user.id)).toBe(100);
  });

  it("actual image worker commits one charge, artifact and completed delivery together", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id, "image_generate");
    const response = await image(request(job)); expect(response.status).toBe(200);
    const saved = (await getAsyncJobById(job.id))!;
    expect(saved).toMatchObject({ status: "completed", billing_state: "completed", result: { imageUrl: "https://zovus.ru/api/scene-image/synthetic" } });
    expect(saved.charge_transaction_id).toBeTruthy(); expect(await getUserBalance(user.id)).toBe(80); expect(await countHistory(user.id)).toBe(1);
    expect((await image(request(job))).status).toBe(200); expect(m.generate).toHaveBeenCalledOnce(); expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it("actual image provider failure refunds the exact bound job and produces no artifact", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id, "image_generate"); m.generate.mockResolvedValue(null);
    expect((await image(request(job))).status).toBe(502);
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "failed", billing_state: "refunded" });
    expect(await getUserBalance(user.id)).toBe(100); expect(await countHistory(user.id)).toBe(0);
  });
  it("actual image late provider result after timeout/refund cannot save or turn the job successful", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id, "image_generate");
    let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
    m.generate.mockImplementationOnce(async () => { await pending; return { imageUrl: "https://zovus.ru/api/scene-image/late", scene: "destiny_card" }; });
    const running = image(request(job)); await vi.waitFor(() => expect(m.generate).toHaveBeenCalledOnce(), { timeout: 15000 });
    expect(await failAsyncJobAndRefundIfCharged(job.id, "synthetic timeout")).toMatchObject({ refunded: true }); release();
    expect((await running).status).toBe(500); expect(await countHistory(user.id)).toBe(0); expect(await getUserBalance(user.id)).toBe(100);
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "failed", billing_state: "refunded" });
  });
  it("an existing job-owned legacy held receipt keeps its actual discounted price", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const held = await chargeForSession({ userId: user.id, cost: 7, actionType: "READING", idempotencyKey: "synthetic-legacy-job" });
    await markAsyncJobCharged(job.id, held.transactionId!);
    const charge = await chargeRuneActionForWorkerJob({ request: request(job), userId: user.id, action: "READING", operationIdentity: "spread-resource:synthetic" });
    expect(charge).toMatchObject({ transactionId: held.transactionId, spentRunes: 7 }); expect(await countSpendTransactions(user.id)).toBe(1);
    const entry = await saveHistoryProductReceipt({ request: request(job), history: history(user.id), transactionId: charge.transactionId, result: { reading: "Сохранённая синтетическая трактовка" } });
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "completed", result: { historyId: entry.id } }); expect(await getUserBalance(user.id)).toBe(93);
  });
  it("old unbound plain-worker content receipt is atomically adopted without a second charge", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const legacyPurchase = { idempotencyKey: "reading:legacy-content", operationIdentity: "spread-resource:synthetic" };
    const old = await chargeForSession({ userId: user.id, cost: 7, actionType: "READING", ...legacyPurchase });
    const args = { request: request(job), userId: user.id, action: "READING" as const, operationIdentity: legacyPurchase.operationIdentity, legacyPurchase };
    expect((await chargeRuneActionForWorkerJob(args)).transactionId).toBe(old.transactionId);
    expect((await chargeRuneActionForWorkerJob(args)).transactionId).toBe(old.transactionId);
    expect((await getAsyncJobById(job.id))!).toMatchObject({ billing_state: "charged", charge_transaction_id: old.transactionId });
    expect(await getUserBalance(user.id)).toBe(93); expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it("actual image worker adopts its old content-bound charge before saving", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id, "image_generate");
    const resource = sceneImageResourceIdentity(body as Parameters<typeof sceneImageResourceIdentity>[0], "Synthetic style");
    const old = await chargeForSession({ userId: user.id, cost: 17, actionType: "DESTINY_CARD", operationIdentity: resource,
      idempotencyKey: `image:${createHash("sha256").update(resource).digest("hex").slice(0, 40)}` });
    expect((await image(request(job))).status).toBe(200);
    expect((await getAsyncJobById(job.id))!).toMatchObject({ billing_state: "completed", charge_transaction_id: old.transactionId });
    expect(await countSpendTransactions(user.id)).toBe(1); expect(await getUserBalance(user.id)).toBe(83);
  });
  it("same job exact content reuses payment, while a different resource is a typed conflict", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const args = { request: request(job), userId: user.id, action: "READING" as const, operationIdentity: "spread-resource:first" };
    const first = await chargeRuneActionForWorkerJob(args), retry = await chargeRuneActionForWorkerJob(args);
    expect(retry.transactionId).toBe(first.transactionId);
    await expect(chargeRuneActionForWorkerJob({ ...args, operationIdentity: "spread-resource:other" })).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    expect(await countSpendTransactions(user.id)).toBe(1); expect(await getUserBalance(user.id)).toBe(90);
  });
  it("refunded receipt repurchase atomically replaces job binding before the retry may save", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const args = { request: request(job), userId: user.id, action: "READING" as const, operationIdentity: "spread-resource:synthetic" };
    const first = await chargeRuneActionForWorkerJob(args);
    await refundWorkerJobCharge(args.request, { userId: user.id, cost: 10, wasFreeQuestion: false, transactionId: first.transactionId });
    const retry = await chargeRuneActionForWorkerJob(args);
    expect(retry.transactionId).not.toBe(first.transactionId); expect((await getAsyncJobById(job.id))!.charge_transaction_id).toBe(retry.transactionId);
    await expect(saveHistoryProductReceipt({ request: args.request, history: history(user.id), transactionId: first.transactionId, result: {} })).rejects.toThrow("stale_async_job_attempt");
    await saveHistoryProductReceipt({ request: args.request, history: history(user.id), transactionId: retry.transactionId, result: { reading: "Сохранённая синтетическая трактовка" } });
    expect(await getUserBalance(user.id)).toBe(90); expect(await countSpendTransactions(user.id)).toBe(2); expect(await countHistory(user.id)).toBe(1);
  });
  it("reaped old attempt can neither charge nor save; new attempt reuses the held purchase", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const args = { request: request(job), userId: user.id, action: "READING" as const, operationIdentity: "spread-resource:synthetic" };
    const held = await chargeRuneActionForWorkerJob(args);
    await query("UPDATE async_jobs SET started_at=now()-interval '20 minutes',locked_at=now()-interval '20 minutes' WHERE id=$1", [job.id]);
    expect(await reapWatchdogRunningAsyncJobs({ maxRunningMs: 300000, maxAttempts: 5, kinds: ["reading"] })).toMatchObject({ requeued: 1 });
    await query("UPDATE async_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=$1", [job.id]);
    await claimAsyncJobs({ workerId: "new-worker", kinds: ["reading"], limit: 10 }); const current = (await getAsyncJobById(job.id))!;
    await expect(chargeRuneActionForWorkerJob(args)).rejects.toThrow("stale_async_job_attempt");
    await expect(saveHistoryProductReceipt({ request: args.request, history: history(user.id), transactionId: held.transactionId, result: {} })).rejects.toThrow("stale_async_job_attempt");
    expect((await chargeRuneActionForWorkerJob({ ...args, request: request(current) })).transactionId).toBe(held.transactionId);
    expect(await countHistory(user.id)).toBe(0); expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it.each(["reading", "scene_image"] as const)("watchdog restores a durably saved %s before any refund", async kind => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id, kind === "reading" ? "reading" : "image_generate");
    const held = await chargeRuneActionForWorkerJob({ request: request(job), userId: user.id, action: kind === "reading" ? "READING" : "DESTINY_CARD" });
    const data = history(user.id, kind); const entry = await createHistoryEntry({ ...data, contextData: { ...data.contextData, transactionId: held.transactionId } });
    await query("UPDATE async_jobs SET started_at=now()-interval '20 minutes',locked_at=now()-interval '20 minutes' WHERE id=$1", [job.id]);
    await reapWatchdogRunningAsyncJobs({ maxRunningMs: 300000, maxAttempts: 1, kinds: [job.kind] });
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "completed", billing_state: "completed", result: { historyId: entry.id } });
    expect(await getUserBalance(user.id)).toBe(kind === "reading" ? 90 : 80);
    expect(Number((await query("SELECT count(*)::int n FROM rune_transactions WHERE user_id=$1 AND type='refund'", [user.id])).rows[0].n)).toBe(0);
  });
  it("watchdog refunds charged plain reading when no durable artifact exists", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    await chargeRuneActionForWorkerJob({ request: request(job), userId: user.id, action: "READING" });
    await query("UPDATE async_jobs SET started_at=now()-interval '20 minutes',locked_at=now()-interval '20 minutes' WHERE id=$1", [job.id]);
    await reapWatchdogRunningAsyncJobs({ maxRunningMs: 300000, maxAttempts: 1, kinds: ["reading"] });
    expect((await getAsyncJobById(job.id))!).toMatchObject({ status: "failed", billing_state: "refunded" }); expect(await getUserBalance(user.id)).toBe(100);
  });
  it("stored paid reading is protected from a delivery failure refund", async () => {
    const user = await createTestUser({ runeBalance: 100 }), job = await jobFor(user.id);
    const charge = await chargeRuneActionForWorkerJob({ request: request(job), userId: user.id, action: "READING" });
    await saveHistoryProductReceipt({ request: request(job), history: history(user.id), transactionId: charge.transactionId, result: { reading: "Сохранённая синтетическая трактовка" } });
    expect(await refundWorkerJobCharge(request(job), { userId: user.id, cost: 10, wasFreeQuestion: false, transactionId: charge.transactionId })).toMatchObject({ refunded: false });
    expect(await getUserBalance(user.id)).toBe(90); expect((await getAsyncJobById(job.id))!.status).toBe("completed");
  });
});
