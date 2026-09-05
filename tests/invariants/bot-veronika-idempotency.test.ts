import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// Session-memory writes lifetime counters in the background. Await the real
// writes before the next fixture TRUNCATE, which otherwise deadlocks with them.
const lifetimeWrites = vi.hoisted(() => new Set<Promise<void>>());
vi.mock("@/lib/user-lifetime-stats", async () => {
  const actual = await vi.importActual<typeof import("@/lib/user-lifetime-stats")>("@/lib/user-lifetime-stats");
  return { ...actual, recordLifetimeSessionActivity: (...args: Parameters<typeof actual.recordLifetimeSessionActivity>) => {
    const work = actual.recordLifetimeSessionActivity(...args);
    lifetimeWrites.add(work);
    return work;
  } };
});
import {
  buildBotProductChargeKey,
  bindBotChargeSession,
  findSessionIdForBotCharge,
} from "@/lib/telegram/bot-charge-idempotency";
import {
  CHARGE_IDEM_WINDOW_SEC,
  chargeForSession,
  buildFallbackChargeIdempotencyKey,
} from "@/lib/services/billing-service";
import { linkTelegramToAccount } from "@/lib/telegram/accounts";
import { botRunVeronikaSpread } from "@/lib/telegram/bot-product-service";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import {
  countSpendTransactions,
  createTestUser,
  getUserBalance,
} from "./db/fixtures";

vi.mock("@/lib/chat-prompts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat-prompts")>(
    "@/lib/chat-prompts"
  );
  return {
    ...actual,
    generateReading: vi.fn(
      async (
        _prompt: string,
        opts?: { tarotCards?: { name: string }[] }
      ) => {
        const names = (opts?.tarotCards ?? []).map((c) => c.name);
        const body = names.length
          ? names
              .map((n, i) => {
                if (i === 0) {
                  return `${n} показывает, с чего начинается история: заметьте первую эмоцию и назовите её вслух без оценки.`;
                }
                if (i === 1) {
                  return `${n} описывает текущий узел: выберите один разговор на этой неделе и подготовьте две честные фразы.`;
                }
                return `${n} указывает на перспективу: запишите маленькую цель на семь дней и отметьте первый видимый прогресс.`;
              })
              .join("\n\n")
          : "Ответ мягкий и ясный: сделайте один честный шаг сегодня.";
        return {
          text: `${body}\n\nСобранный вывод: держитесь конкретного действия вместо бесконечного анализа, и возвращайтесь к картам только после шага.`,
          fromLlm: true,
        };
      }
    ),
  };
});

import { generateReading } from "@/lib/chat-prompts";
import { createUser } from "@/lib/accounts";

async function linkTelegramUser(profileUserId: string, telegramUserId: number) {
  const email = `tg-${telegramUserId}@invariant.test`;
  const passwordHash = createHash("sha256").update(`pw-${telegramUserId}`).digest("hex");
  const account = await createUser(email, passwordHash, "TG Test");
  await query(`UPDATE user_accounts SET profile_user_id = $2 WHERE id = $1`, [
    account.id,
    profileUserId,
  ]);
  const linked = await linkTelegramToAccount({
    accountId: account.id,
    data: {
      id: telegramUserId,
      first_name: "Test",
      auth_date: Math.floor(Date.now() / 1000),
      hash: "invariant",
    },
  });
  if (!linked.ok) throw new Error(`link failed: ${linked.code}`);
  return account.id;
}

async function countUserSessions(userId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM sessions WHERE user_id = $1`,
    [userId]
  );
  return Number(rows[0]?.n ?? 0);
}

describe("bot-charge-idempotency keys (pure)", () => {
  it("never embeds a session-shaped uuid as the only discriminator when event is set", () => {
    const userId = "11111111-2222-4333-8444-555555555555";
    const key = buildBotProductChargeKey({
      kind: "veronika",
      userId,
      clientEventId: "9001",
      content: "Что будет с работой?",
    });
    expect(key.startsWith(`tg-veronika:${userId}:9001:`)).toBe(true);
    expect(key.includes(":sess=")).toBe(false);
  });

  it("different client events produce different keys", () => {
    const userId = "11111111-2222-4333-8444-555555555555";
    const a = buildBotProductChargeKey({
      kind: "veronika",
      userId,
      clientEventId: "1",
      content: "same question",
    });
    const b = buildBotProductChargeKey({
      kind: "veronika",
      userId,
      clientEventId: "2",
      content: "same question",
    });
    expect(a).not.toBe(b);
  });
});

describe.skipIf(!hasTestDb)("botRunVeronikaSpread idempotency (db)", () => {
  installDbLifecycle();

  afterEach(async () => {
    try { await Promise.all(lifetimeWrites); }
    finally { lifetimeWrites.clear(); }
    vi.mocked(generateReading).mockClear();
  });

  it("same telegram event: one spend, one session, LLM once", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const tgId = 7_700_001 + Math.floor(Math.random() * 1000);
    await linkTelegramUser(user.id, tgId);
    const eventId = `upd-${tgId}-same`;

    const first = await botRunVeronikaSpread({
      telegramUserId: tgId,
      question: "Что меня ждёт в любви?",
      clientEventId: eventId,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await botRunVeronikaSpread({
      telegramUserId: tgId,
      question: "Что меня ждёт в любви?",
      clientEventId: eventId,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(await countSpendTransactions(user.id)).toBe(1);
    expect(await countUserSessions(user.id)).toBe(1);
    expect(vi.mocked(generateReading)).toHaveBeenCalledTimes(1);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.reused || second.pending || Boolean(second.reading?.trim())).toBe(true);
    expect("error" in second && second.ok === false).toBe(false);
  });

  it("different telegram events: two spends, two sessions", async () => {
    const user = await createTestUser({ runeBalance: 100 });
    const tgId = 7_800_001 + Math.floor(Math.random() * 1000);
    await linkTelegramUser(user.id, tgId);

    const a = await botRunVeronikaSpread({
      telegramUserId: tgId,
      question: "Вопрос А про карьеру?",
      clientEventId: `evt-a-${tgId}`,
    });
    const b = await botRunVeronikaSpread({
      telegramUserId: tgId,
      question: "Вопрос Б про переезд?",
      clientEventId: `evt-b-${tgId}`,
    });
    expect(a.ok && b.ok).toBe(true);
    expect(await countSpendTransactions(user.id)).toBe(2);
    expect(await countUserSessions(user.id)).toBe(2);
    expect(vi.mocked(generateReading)).toHaveBeenCalledTimes(2);
    if (a.ok && b.ok) {
      expect(a.sessionId).not.toBe(b.sessionId);
    }
  });

  it("bind/find session on charge description round-trips", async () => {
    const user = await createTestUser({ runeBalance: 40 });
    const key = buildBotProductChargeKey({
      kind: "veronika",
      userId: user.id,
      clientEventId: "bind-test",
      content: "bind",
    });
    const charge = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: key,
      description: `Telegram Veronika · ${key}`,
    });
    const sessionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    await bindBotChargeSession(charge.transactionId, sessionId);
    expect(await findSessionIdForBotCharge(charge.transactionId)).toBe(sessionId);
  });

  it("after fallback window bucket changes, omit-event path charges again", async () => {
    const user = await createTestUser({ runeBalance: 80 });
    const now = Date.now();
    const keyA = buildFallbackChargeIdempotencyKey({
      userId: user.id,
      actionType: "READING",
      cost: 10,
      nowMs: now,
    });
    const keyB = buildFallbackChargeIdempotencyKey({
      userId: user.id,
      actionType: "READING",
      cost: 10,
      nowMs: now + CHARGE_IDEM_WINDOW_SEC * 1000 + 1,
    });
    await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: keyA,
    });
    await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: keyB,
    });
    expect(await countSpendTransactions(user.id)).toBe(2);
    expect(await getUserBalance(user.id)).toBe(60);
  });
});
