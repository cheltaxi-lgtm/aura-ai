import { describe, expect, it } from "vitest";
import {
  bindBotChargeSession,
  buildBotProductChargeKey,
  findSessionIdForBotCharge,
} from "@/lib/telegram/bot-charge-idempotency";
import { chargeForSession } from "@/lib/services/billing-service";
import { createSession } from "@/lib/session";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";

const TECH_MARK_RE = /:sess=|sess=/i;

describe.skipIf(!hasTestDb)("bot-charge result_session_id (db)", () => {
  installDbLifecycle();

  it("dedupe resolves session from column even when description is arbitrary", async () => {
    const user = await createTestUser({ runeBalance: 50 });
    const key = buildBotProductChargeKey({
      kind: "veronika",
      userId: user.id,
      clientEventId: "col-1",
      content: "column resume",
    });
    const charge = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: key,
      description: "Telegram: расклад Вероники",
    });
    const session = await createSession(undefined, user.id);
    await bindBotChargeSession(charge.transactionId, session.id);

    // Poison description — resume must ignore it.
    await query(`UPDATE rune_transactions SET description = $2 WHERE id = $1`, [
      charge.transactionId,
      "totally unrelated human text without markers",
    ]);

    const found = await findSessionIdForBotCharge(charge.transactionId);
    expect(found).toBe(session.id);

    const { rows } = await query<{ description: string }>(
      `SELECT description FROM rune_transactions WHERE id = $1`,
      [charge.transactionId]
    );
    expect(TECH_MARK_RE.test(rows[0]?.description ?? "")).toBe(false);
  });

  it("spend without result_session_id returns null (pending path, not throw)", async () => {
    const user = await createTestUser({ runeBalance: 40 });
    const key = buildBotProductChargeKey({
      kind: "veronika",
      userId: user.id,
      clientEventId: "no-bind",
      content: "pending",
    });
    const charge = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: key,
      description: "Telegram: расклад Вероники",
    });
    await expect(findSessionIdForBotCharge(charge.transactionId)).resolves.toBeNull();
  });

  it("after bind, description stays free of technical markers", async () => {
    const user = await createTestUser({ runeBalance: 40 });
    const key = buildBotProductChargeKey({
      kind: "catalog",
      userId: user.id,
      clientEventId: "clean-desc",
      content: "slug:triplet",
    });
    const charge = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "INTENTION_SPREAD",
      idempotencyKey: key,
      description: "Telegram: каталог раскладов",
    });
    const session = await createSession(undefined, user.id);
    await bindBotChargeSession(charge.transactionId, session.id);

    const { rows } = await query<{ description: string; result_session_id: string | null }>(
      `SELECT description, result_session_id::text AS result_session_id
       FROM rune_transactions WHERE id = $1`,
      [charge.transactionId]
    );
    expect(rows[0]?.result_session_id).toBe(session.id);
    expect(TECH_MARK_RE.test(rows[0]?.description ?? "")).toBe(false);
    expect(rows[0]?.description).toBe("Telegram: каталог раскладов");
  });
});
