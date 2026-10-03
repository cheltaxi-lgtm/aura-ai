import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { query, withTransaction } from "@/lib/db";
import { chargeForSession, rollbackChargeEx, BillingIdempotencyConflictError,
  ConfirmedCostExceededError, InsufficientFundsError } from "@/lib/services/billing-service";
import { createRitual, saveRitualCards, getRitualById } from "@/lib/ritual-service";
import { failRitualGeneration } from "@/lib/ritual-generation-runner";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { countSpendTransactions, createTestUser, getUserBalance } from "./db/fixtures";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/require-auth", () => ({ requireProfileUserId: async () => ({ auth: { sub: "synthetic-account" }, profileUserId: auth.userId }) }));
vi.mock("@/lib/api-guards", () => ({ enforcePaidRouteRateLimit: async () => null }));
vi.mock("@/lib/accounts", () => ({ resolveUnlimitedAccess: async () => false }));
import { POST as payRitual } from "@/app/api/ritual/[id]/pay/route";

async function session(userId: string) {
  const result = await query<{ id: string }>("INSERT INTO sessions(user_id,character_key) VALUES($1,'tarolog') RETURNING id", [userId]);
  return result.rows[0].id;
}
async function used(id: string) {
  return (await query<{ free_questions_used: number }>("SELECT free_questions_used FROM sessions WHERE id=$1", [id])).rows[0].free_questions_used;
}
async function ritual(userId: string) {
  const created = await createRitual({ userId, characterKey: "veronika", ritualType: "love", moonPhase: "new", moonSign: "aries", runeCost: 20 });
  await saveRitualCards(created.id, [{ name: "Солнце", position: "Совет" }]);
  return created.id;
}
function pay(id: string, key: string) {
  return payRitual(new NextRequest(`http://localhost/api/ritual/${id}/pay`, { method: "POST", headers: { "Idempotency-Key": key } }), { params: Promise.resolve({ id }) });
}

describe.skipIf(!hasTestDb)("billing purchase identity (real PostgreSQL)", () => {
  installDbLifecycle();
  beforeEach(() => { auth.userId = ""; });

  it("a server-shaped key without saved operation proof fails safely instead of buying another payload", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    await chargeForSession({ userId: user.id, cost: 2, actionType: "VOICE_TTS", idempotencyKey: "tts:voice:digest" });
    await expect(chargeForSession({ userId: user.id, cost: 8, actionType: "VOICE_TTS", idempotencyKey: "tts:voice:digest", operationIdentity: "actual-long-text" })).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    expect(await getUserBalance(user.id)).toBe(98); expect(await countSpendTransactions(user.id)).toBe(1);
  });
  it("different bound operations with the same action/key each own one charge and retain their original price", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const args = { userId: user.id, cost: 10, actionType: "READING", idempotencyKey: "collision" };
    const first = await chargeForSession({ ...args, operationIdentity: "question-a" });
    const second = await chargeForSession({ ...args, operationIdentity: "question-b" });
    const replay = await chargeForSession({ ...args, cost: 60, maxCost: 0, operationIdentity: "question-b" });
    expect(second.transactionId).not.toBe(first.transactionId); expect(replay.transactionId).toBe(second.transactionId);
    expect(await getUserBalance(user.id)).toBe(80); expect(await countSpendTransactions(user.id)).toBe(2);
  });
  it("a refunded bound operation is repurchased once across parallel exact retries", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const args = { userId: user.id, cost: 10, actionType: "READING", idempotencyKey: "bound-refund", operationIdentity: "same-resource" };
    const first = await chargeForSession(args);
    await rollbackChargeEx({ userId: user.id, cost: 10, wasFreeQuestion: false, transactionId: first.transactionId });
    const next = await Promise.all(Array.from({ length: 4 }, () => chargeForSession(args)));
    expect(new Set(next.map(c => c.transactionId)).size).toBe(1); expect(next[0].transactionId).not.toBe(first.transactionId);
    expect(await getUserBalance(user.id)).toBe(90); expect(await countSpendTransactions(user.id)).toBe(2);
  });

  it("a free chat ledger row cannot authorize any paid action", async () => {
    const user = await createTestUser();
    const id = await session(user.id);
    await chargeForSession({ userId: user.id, cost: 3, actionType: "QUESTION", sessionId: id, reserveFreeSlot: true, idempotencyKey: "shared" });
    await expect(chargeForSession({ userId: user.id, cost: 20, actionType: "ritual", idempotencyKey: "shared" })).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await getUserBalance(user.id)).toBe(0);
    expect(await countSpendTransactions(user.id)).toBe(0);
  });

  it("same raw key for two actions charges each action once", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const first = await chargeForSession({ userId: user.id, cost: 10, actionType: "READING", idempotencyKey: "same" });
    const args = { userId: user.id, cost: 20, actionType: "VOICE_TTS", idempotencyKey: "same" };
    const second = await chargeForSession(args);
    const retry = await chargeForSession(args);
    expect(second.spentRunes).toBe(20); expect(second.transactionId).not.toBe(first.transactionId);
    expect(retry.transactionId).toBe(second.transactionId); expect(retry.deduplicated).toBe(true);
    expect(await getUserBalance(user.id)).toBe(70); expect(await countSpendTransactions(user.id)).toBe(2);
  });

  it.each([false, true])("same action/key cannot reuse another session (free=%s)", async (free) => {
    const user = await createTestUser({ runeBalance: 100 });
    const a = await session(user.id), b = await session(user.id);
    const base = { userId: user.id, cost: 10, actionType: "QUESTION", reserveFreeSlot: true, freeQuestionLimit: free ? 2 : 0, idempotencyKey: "turn" };
    const first = await chargeForSession({ ...base, sessionId: a });
    const second = await chargeForSession({ ...base, sessionId: b });
    expect(second.transactionId).not.toBe(first.transactionId);
    expect(second.deduplicated).not.toBe(true);
    expect(await used(a)).toBe(1); expect(await used(b)).toBe(1);
    expect(await getUserBalance(user.id)).toBe(free ? 100 : 80);
    const replay = await chargeForSession({ ...base, sessionId: b });
    expect(replay.transactionId).toBe(second.transactionId); expect(await used(b)).toBe(1);
  });

  it("refunded free turn reserves its slot once again across concurrent retries", async () => {
    const user = await createTestUser();
    const id = await session(user.id);
    const args = { userId: user.id, cost: 10, actionType: "QUESTION", sessionId: id, reserveFreeSlot: true, freeQuestionLimit: 2, idempotencyKey: "free" };
    const first = await chargeForSession(args);
    await rollbackChargeEx({ userId: user.id, cost: 0, wasFreeQuestion: true, slotReserved: true, sessionId: id, transactionId: first.transactionId });
    expect(await used(id)).toBe(0);
    const retry = await Promise.all(Array.from({ length: 5 }, () => chargeForSession(args)));
    expect(new Set(retry.map((r) => r.transactionId)).size).toBe(1);
    expect(retry[0].transactionId).not.toBe(first.transactionId);
    expect(retry.filter((r) => r.slotReserved)).toHaveLength(1); expect(await used(id)).toBe(1);
    expect(await getUserBalance(user.id)).toBe(0);
  });

  it("refunded paid attempts are charged again and each latest held retry dedupes", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const args = { userId: user.id, cost: 20, actionType: "READING", idempotencyKey: "retry" };
    const ids: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const charge = await chargeForSession(args); ids.push(charge.transactionId!);
      expect(charge.spentRunes).toBe(20);
      await rollbackChargeEx({ userId: user.id, cost: 20, wasFreeQuestion: false, transactionId: charge.transactionId });
    }
    const held = await Promise.all(Array.from({ length: 5 }, () => chargeForSession(args)));
    expect(new Set(ids).size).toBe(3); expect(ids).not.toContain(held[0].transactionId);
    expect(new Set(held.map((r) => r.transactionId)).size).toBe(1);
    expect(held.reduce((sum, r) => sum + r.spentRunes, 0)).toBe(20);
    expect(await getUserBalance(user.id)).toBe(80); expect(await countSpendTransactions(user.id)).toBe(4);
  });

  it("a refunded spend never bypasses funds or a newly confirmed cost", async () => {
    const user = await createTestUser({ runeBalance: 20 });
    const args = { userId: user.id, cost: 20, actionType: "READING", idempotencyKey: "refunded" };
    const first = await chargeForSession(args);
    await rollbackChargeEx({ userId: user.id, cost: 20, wasFreeQuestion: false, transactionId: first.transactionId });
    await expect(chargeForSession({ ...args, maxCost: 5 })).rejects.toBeInstanceOf(ConfirmedCostExceededError);
    await query("UPDATE users SET rune_balance=0 WHERE id=$1", [user.id]);
    await expect(chargeForSession(args)).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await countSpendTransactions(user.id)).toBe(1);
  });

  it("a held discounted purchase retains its receipt after price/free-tier changes", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const args = { userId: user.id, cost: 25, actionType: "PALM_READING", idempotencyKey: "palm-reading:snapshot" };
    const first = await chargeForSession(args);
    const replay = await chargeForSession({ ...args, cost: 40, maxCost: 0 });
    expect(replay.transactionId).toBe(first.transactionId); expect(replay.spentRunes).toBe(0);
    expect(await getUserBalance(user.id)).toBe(75); expect(await countSpendTransactions(user.id)).toBe(1);
    const id = await session(user.id);
    const free = { userId: user.id, cost: 3, actionType: "QUESTION", sessionId: id, reserveFreeSlot: true, idempotencyKey: "free-policy" };
    const turn = await chargeForSession(free);
    const same = await chargeForSession({ ...free, cost: 10, freeQuestionLimit: 0, hasFullAccess: true });
    expect(same.transactionId).toBe(turn.transactionId); expect(await used(id)).toBe(1);
  });

  it("ambiguous held legacy session receipt fails safely without a second debit", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const first = await chargeForSession({ userId: user.id, cost: 10, actionType: "QUESTION", idempotencyKey: "old-native" });
    const id = await session(user.id);
    await expect(chargeForSession({ userId: user.id, cost: 10, actionType: "QUESTION", sessionId: id, reserveFreeSlot: true, idempotencyKey: "old-native" })).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    expect(await getUserBalance(user.id)).toBe(90); expect(await used(id)).toBe(0);
    expect(await countSpendTransactions(user.id)).toBe(1); expect(first.transactionId).toBeTruthy();
  });

  it("a caller-owned transaction cannot commit a reserved slot after rejecting confirmed cost", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const id = await session(user.id);
    await withTransaction(async (client) => {
      await expect(chargeForSession({ userId: user.id, cost: 10, maxCost: 0, actionType: "QUESTION",
        sessionId: id, reserveFreeSlot: true, freeQuestionLimit: 0, idempotencyKey: "confirmed", client })).rejects.toBeInstanceOf(ConfirmedCostExceededError);
    });
    expect(await used(id)).toBe(0); expect(await getUserBalance(user.id)).toBe(100);
    expect(await countSpendTransactions(user.id)).toBe(0);
  });

  it("a refunded free turn cannot reuse a receipt to bypass the exhausted paid tier", async () => {
    const user = await createTestUser();
    const id = await session(user.id);
    const args = { userId: user.id, cost: 10, actionType: "QUESTION", sessionId: id, reserveFreeSlot: true,
      freeQuestionLimit: 2, idempotencyKey: "exhausted" };
    const first = await chargeForSession(args);
    await rollbackChargeEx({ userId: user.id, cost: 0, wasFreeQuestion: true, slotReserved: true, sessionId: id, transactionId: first.transactionId });
    await query("UPDATE sessions SET free_questions_used=2 WHERE id=$1", [id]);
    await expect(chargeForSession(args)).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await used(id)).toBe(2); expect(await getUserBalance(user.id)).toBe(0);
  });

  it("legacy raw resource keys cannot silently double-charge a pending purchase", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    await chargeForSession({ userId: user.id, cost: 2, actionType: "VOICE_TTS", idempotencyKey: "old-tts" });
    await expect(chargeForSession({ userId: user.id, cost: 2, actionType: "VOICE_TTS", idempotencyKey: "tts:voice:digest:2", legacyIdempotencyKeys: ["old-tts"] })).rejects.toBeInstanceOf(BillingIdempotencyConflictError);
    expect(await getUserBalance(user.id)).toBe(98); expect(await countSpendTransactions(user.id)).toBe(1);
  });

  it("a free slot cannot be reserved in another user's session", async () => {
    const user = await createTestUser(), other = await createTestUser();
    const id = await session(other.id);
    await expect(chargeForSession({ userId: user.id, cost: 3, actionType: "QUESTION", sessionId: id, reserveFreeSlot: true, idempotencyKey: "foreign" })).rejects.toThrow("billing_session_not_found");
    expect(await used(id)).toBe(0);
  });

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid cost %s before any balance mutation", async (cost) => {
    const user = await createTestUser({ runeBalance: 100 });
    await expect(chargeForSession({ userId: user.id, cost, actionType: "READING" })).rejects.toThrow("invalid_billing_cost");
    expect(await getUserBalance(user.id)).toBe(100); expect(await countSpendTransactions(user.id)).toBe(0);
  });

  it("real ritual pay cannot reuse a raw FREE_CHAT receipt at zero balance", async () => {
    const user = await createTestUser(); auth.userId = user.id;
    await query("INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,action_type,idempotency_key) VALUES($1,'spend',0,0,'free','FREE_CHAT','collision')", [user.id]);
    const a = await ritual(user.id), b = await ritual(user.id);
    expect((await pay(a, "collision")).status).toBe(402); expect((await pay(b, "collision")).status).toBe(402);
    expect((await getRitualById(a))?.status).toBe("payment"); expect((await getRitualById(b))?.status).toBe("payment");
    expect(await countSpendTransactions(user.id)).toBe(0);
  });

  it("parallel pay of one ritual ignores changing client keys and commits one receipt", async () => {
    const user = await createTestUser({ runeBalance: 100 }); auth.userId = user.id;
    const id = await ritual(user.id);
    const responses = await Promise.all(Array.from({ length: 5 }, () => pay(id, randomUUID())));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await getUserBalance(user.id)).toBe(80); expect(await countSpendTransactions(user.id)).toBe(1);
    const row = await getRitualById(id); expect(row?.status).toBe("generating"); expect(row?.transaction_id).toBeTruthy();
    await pay(id, "new-key"); expect(await getUserBalance(user.id)).toBe(80);
  });

  it("different rituals with one client key each pay their own server UUID", async () => {
    const user = await createTestUser({ runeBalance: 100 }); auth.userId = user.id;
    const a = await ritual(user.id), b = await ritual(user.id);
    expect((await pay(a, "shared")).status).toBe(200); expect((await pay(b, "shared")).status).toBe(200);
    expect((await getRitualById(a))?.transaction_id).not.toBe((await getRitualById(b))?.transaction_id);
    expect(await getUserBalance(user.id)).toBe(60); expect(await countSpendTransactions(user.id)).toBe(2);
  });

  it("refund and repay of a failed ritual never reuse the refunded receipt", async () => {
    const user = await createTestUser({ runeBalance: 100 }); auth.userId = user.id;
    const id = await ritual(user.id); await pay(id, "same");
    const failed = (await getRitualById(id))!;
    expect(await failRitualGeneration(failed)).toBe(true); expect(await getUserBalance(user.id)).toBe(100);
    await Promise.all([pay(id, "same"), pay(id, "another")]);
    const current = (await getRitualById(id))!;
    expect(current.transaction_id).not.toBe(failed.transaction_id); expect(await getUserBalance(user.id)).toBe(80);
    expect(await failRitualGeneration(failed)).toBe(false); expect(await getUserBalance(user.id)).toBe(80);
    await query("UPDATE rituals SET status='completed' WHERE id=$1", [id]);
    expect(await failRitualGeneration(current)).toBe(false); expect(await getUserBalance(user.id)).toBe(80);
  });
});
