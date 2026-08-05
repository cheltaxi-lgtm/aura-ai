import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  chargeForSession,
  InsufficientFundsError,
} from "@/lib/services/billing-service";
import { isGuestResumeSpreadType } from "@/lib/guest-resume-billing";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import {
  countSpendTransactions,
  createTestUser,
  getUserBalance,
} from "./db/fixtures";

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("billing-authority", () => {
  it("reading route never reads client isFree / billingExempt / guestResume body flags", () => {
    const src = readSrc("src/app/api/reading/route.ts");
    expect(src).not.toMatch(/body\s*\.\s*isFree\b/);
    expect(src).not.toMatch(/body\s*\.\s*billingExempt\b/);
    expect(src).not.toMatch(/body\s*\.\s*guestResume\b/);
    expect(src).toContain("resolveGuestResumeFreeReading");
  });

  it("guest-resume billing module documents server authority (no client flag trust)", () => {
    const src = readSrc("src/lib/guest-resume-billing.ts");
    expect(src).toMatch(/Never trust client guestResume/i);
    expect(src).toContain("resolveGuestResumeFreeReading");
  });

  it("guest_resume spread type is distinct from daily", () => {
    expect(isGuestResumeSpreadType("guest_resume")).toBe(true);
    expect(isGuestResumeSpreadType("daily")).toBe(false);
    expect(isGuestResumeSpreadType(null)).toBe(false);
  });

  it("InsufficientFundsError carries balance/required for 402 mapping", () => {
    const err = new InsufficientFundsError(5, 40);
    expect(err.balance).toBe(5);
    expect(err.required).toBe(40);
    expect(err.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("client body flags are not ChargeForSessionParams — paid path needs server cost", () => {
    // Static contract: charge API has no isFree / billingExempt / guestResume knobs.
    const src = readSrc("src/lib/services/billing-service.ts");
    expect(src).toMatch(/export type ChargeForSessionParams/);
    const paramsBlock = src.slice(
      src.indexOf("export type ChargeForSessionParams"),
      src.indexOf("export type RollbackChargeParams")
    );
    expect(paramsBlock).not.toMatch(/\bisFree\b/);
    expect(paramsBlock).not.toMatch(/\bbillingExempt\b/);
    expect(paramsBlock).not.toMatch(/\bguestResume\b/);
  });
});

describe.skipIf(!hasTestDb)("billing-authority (db)", () => {
  installDbLifecycle();

  it("insufficient balance refuses charge with no spend ledger row", async () => {
    const user = await createTestUser({ runeBalance: 0 });
    const beforeTx = await countSpendTransactions(user.id);
    const beforeBal = await getUserBalance(user.id);
    expect(beforeBal).toBe(0);

    await expect(
      chargeForSession({
        userId: user.id,
        cost: 10,
        actionType: "READING",
        description: "invariant insufficient",
      })
    ).rejects.toBeInstanceOf(InsufficientFundsError);

    expect(await getUserBalance(user.id)).toBe(0);
    expect(await countSpendTransactions(user.id)).toBe(beforeTx);
  });

  it("successful charge deducts once; repeat with same transaction_id is NOT idempotent (P0 gap)", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const cost = 15;

    const first = await chargeForSession({
      userId: user.id,
      cost,
      actionType: "READING",
      description: "invariant charge 1",
    });
    expect(first.spentRunes).toBe(cost);
    expect(first.newBalance).toBe(100 - cost);
    expect(first.transactionId).toBeTruthy();

    // Documented gap: ChargeForSessionParams has no input transaction_id for dedupe.
    // Calling charge twice for the same logical operation spends twice.
    // This assertion encodes required idempotent behaviour and stays RED until product implements it.
    const second = await chargeForSession({
      userId: user.id,
      cost,
      actionType: "READING",
      description: `invariant charge retry:${first.transactionId}`,
    });

    // IDEMPOTENCY EXPECTATION (currently violated — leave red):
    // a retry for the same logical charge must be a no-op (same transaction_id / no second spend).
    expect(second.spentRunes, "P0: chargeForSession lacks transaction_id idempotency").toBe(0);
    expect(await getUserBalance(user.id)).toBe(100 - cost);
    expect(await countSpendTransactions(user.id)).toBe(1);
  });

  it("client-like exempt flag alone is server-controlled; without exempt, cost is charged", async () => {
    const user = await createTestUser({ runeBalance: 50 });
    // Passing exempt:false (or omitting) must charge — client cannot force free.
    const result = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      exempt: false,
    });
    expect(result.spentRunes).toBe(10);
    expect(await getUserBalance(user.id)).toBe(40);
  });

  it("parallel chargeForSession with the same idempotencyKey debits once and shares transactionId", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const key = `parallel-key-${user.id}`;
    const [a, b] = await Promise.all([
      chargeForSession({
        userId: user.id,
        cost: 12,
        actionType: "READING",
        idempotencyKey: key,
      }),
      chargeForSession({
        userId: user.id,
        cost: 12,
        actionType: "READING",
        idempotencyKey: key,
      }),
    ]);
    expect(a.transactionId).toBeTruthy();
    expect(b.transactionId).toBe(a.transactionId);
    expect(a.spentRunes + b.spentRunes).toBe(12);
    expect(await getUserBalance(user.id)).toBe(88);
    expect(await countSpendTransactions(user.id)).toBe(1);
  });

  it("different idempotencyKeys produce two independent spends", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const first = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: `key-a-${user.id}`,
    });
    const second = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: `key-b-${user.id}`,
    });
    expect(first.spentRunes).toBe(10);
    expect(second.spentRunes).toBe(10);
    expect(first.transactionId).not.toBe(second.transactionId);
    expect(await getUserBalance(user.id)).toBe(80);
    expect(await countSpendTransactions(user.id)).toBe(2);
  });

  it("without explicit idempotencyKey still charges (compat path)", async () => {
    const user = await createTestUser({ runeBalance: 40 });
    const result = await chargeForSession({
      userId: user.id,
      cost: 7,
      actionType: "QUESTION",
      description: "compat no key",
    });
    expect(result.spentRunes).toBe(7);
    expect(await getUserBalance(user.id)).toBe(33);
    expect(await countSpendTransactions(user.id)).toBe(1);
  });

  it("same idempotencyKey for different users is scoped per user", async () => {
    const userA = await createTestUser({ name: "Idem A", runeBalance: 50 });
    const userB = await createTestUser({ name: "Idem B", runeBalance: 50 });
    const sharedKey = "shared-across-users";
    const a = await chargeForSession({
      userId: userA.id,
      cost: 8,
      actionType: "READING",
      idempotencyKey: sharedKey,
    });
    const b = await chargeForSession({
      userId: userB.id,
      cost: 8,
      actionType: "READING",
      idempotencyKey: sharedKey,
    });
    expect(a.spentRunes).toBe(8);
    expect(b.spentRunes).toBe(8);
    expect(a.transactionId).not.toBe(b.transactionId);
    expect(await getUserBalance(userA.id)).toBe(42);
    expect(await getUserBalance(userB.id)).toBe(42);
  });

  it("insufficient funds with key leaves no ledger; retry with same key still errors", async () => {
    const user = await createTestUser({ runeBalance: 3 });
    const key = `broke-${user.id}`;
    await expect(
      chargeForSession({
        userId: user.id,
        cost: 20,
        actionType: "READING",
        idempotencyKey: key,
      })
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await countSpendTransactions(user.id)).toBe(0);
    expect(await getUserBalance(user.id)).toBe(3);

    await expect(
      chargeForSession({
        userId: user.id,
        cost: 20,
        actionType: "READING",
        idempotencyKey: key,
      })
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(await countSpendTransactions(user.id)).toBe(0);
    expect(await getUserBalance(user.id)).toBe(3);
  });
});
