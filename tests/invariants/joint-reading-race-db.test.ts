import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { attachSpreadToJointReading } from "@/lib/joint-reading-service";
import { BillingService } from "@/lib/services/billing-service";
import { getRuneBalance } from "@/lib/rune-service";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.skipIf(!hasTestDb)("joint side PostgreSQL compare-and-set and billing", () => {
  installDbLifecycle();

  it("commits only one concurrent personal result and refunds the losing charge", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const token = randomUUID();
    await query(
      `INSERT INTO joint_readings (token, initiator_user_id, spread_id, intent_slug, expires_at)
       VALUES ($1, $2, 'love-7', 'sovmestimost-pary', NOW() + INTERVAL '1 day')`,
      [token, user.id]
    );
    const cards = [{ name: "Колесница", position: "Вы" }];
    const attempts = await Promise.all(["Первый личный текст", "Второй личный текст"].map(async (reading) => {
      const charge = await BillingService.chargeForSession({
        userId: user.id,
        cost: 20,
        actionType: "INTENTION_SPREAD",
        idempotencyKey: `joint-race:${token}:${randomUUID()}`,
      });
      const result = await attachSpreadToJointReading({
        jointToken: token,
        userId: user.id,
        spreadId: "love-7",
        reading,
        cards,
        characterKey: "veronika",
      });
      if (result.ok && !result.alreadySaved) return { reading, saved: true, refunded: false };
      const rollback = await BillingService.rollbackChargeEx({
        userId: user.id,
        cost: charge.spentRunes,
        wasFreeQuestion: charge.wasFreeQuestion,
        actionType: "INTENTION_SPREAD",
        transactionId: charge.transactionId,
      });
      return { reading, saved: false, refunded: rollback.refunded };
    }));

    expect(attempts.filter((attempt) => attempt.saved)).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.refunded)).toHaveLength(1);
    const winner = attempts.find((attempt) => attempt.saved)!;
    const stored = await query<{ initiator_reading: string }>(
      "SELECT initiator_reading FROM joint_readings WHERE token = $1", [token]
    );
    expect(stored.rows[0]?.initiator_reading).toBe(winner.reading);
    expect(await getRuneBalance(user.id)).toBe(80);
    const ledger = await query<{ type: string; count: number }>(
      `SELECT type, COUNT(*)::int AS count FROM rune_transactions
       WHERE user_id = $1 AND (type = 'spend' OR type = 'refund')
       GROUP BY type`, [user.id]
    );
    expect(Object.fromEntries(ledger.rows.map((row) => [row.type, row.count]))).toMatchObject({ spend: 2, refund: 1 });
  });
});
