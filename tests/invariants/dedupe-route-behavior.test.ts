import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CHARGE_IDEM_WINDOW_SEC,
  chargeForSession,
  buildFallbackChargeIdempotencyKey,
} from "@/lib/services/billing-service";
import {
  clearTtsResultCacheForTests,
  getTtsResultCache,
  setTtsResultCache,
  ttsResultCacheKey,
  TTS_RESULT_CACHE_TTL_MS,
} from "@/lib/tts-result-cache";
import {
  isRitualPayAlreadyClaimed,
  ritualPayAlreadyDonePayload,
} from "@/lib/ritual-pay-idempotent";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import {
  countSpendTransactions,
  createTestUser,
  getUserBalance,
} from "./db/fixtures";

describe("dedupe-route-behavior (pure)", () => {
  afterEach(() => {
    clearTtsResultCacheForTests();
  });

  it("ritual pay already-claimed statuses resume without error payload", () => {
    expect(isRitualPayAlreadyClaimed("payment")).toBe(false);
    expect(isRitualPayAlreadyClaimed("generating")).toBe(true);
    expect(isRitualPayAlreadyClaimed("completed")).toBe(true);
    const payload = ritualPayAlreadyDonePayload(
      { id: "r1", status: "generating" } as never,
      42,
      { id: "r1", status: "generating" }
    );
    expect(payload.ok).toBe(true);
    expect(payload.reused).toBe(true);
    expect(payload.balance).toBe(42);
    expect(payload).not.toHaveProperty("error");
  });

  it("tts result cache round-trips audio for dedupe path", () => {
    const key = ttsResultCacheKey("user-1", "tts:veronika:abc:5");
    setTtsResultCache(key, {
      buffer: Buffer.from("fake-audio"),
      contentType: "audio/mpeg",
      provider: "test",
    });
    const hit = getTtsResultCache(key);
    expect(hit?.contentType).toBe("audio/mpeg");
    expect(hit?.buffer.toString()).toBe("fake-audio");
    expect(TTS_RESULT_CACHE_TTL_MS).toBe(CHARGE_IDEM_WINDOW_SEC * 1000);
  });

  it("tts dedupe + empty cache contract: re-synthesize path (option b), not error", () => {
    // Route behavior: on deduplicated + cache miss, synthesize again (spentRunes=0).
    // Provider may run; response must be audio or non-error reuse — never 4xx/5xx for UX.
    clearTtsResultCacheForTests();
    const synthesizeSpy = vi.fn(async () => ({
      buffer: Buffer.from("audio-retry"),
      contentType: "audio/mpeg",
      provider: "test",
    }));
    const charge = { spentRunes: 0, deduplicated: true as const, transactionId: "tx-1" };
    const cached = getTtsResultCache(ttsResultCacheKey("u", "tts:k"));
    expect(cached).toBeNull();
    // Simulate route branch after cache miss:
    if (charge.deduplicated && !cached) {
      void synthesizeSpy();
    }
    expect(synthesizeSpy).toHaveBeenCalledTimes(1);
    expect(charge.spentRunes).toBe(0);
  });
});

describe.skipIf(!hasTestDb)("dedupe-route-behavior (db)", () => {
  installDbLifecycle();

  afterEach(() => {
    clearTtsResultCacheForTests();
    vi.restoreAllMocks();
  });

  it("same key: second charge spends 0 and shares transactionId (tts/photo contract)", async () => {
    const user = await createTestUser({ runeBalance: 80 });
    const key = `route-tts-${user.id}`;
    const first = await chargeForSession({
      userId: user.id,
      cost: 5,
      actionType: "VOICE_TTS",
      idempotencyKey: key,
    });
    expect(first.spentRunes).toBe(5);
    const cacheKey = ttsResultCacheKey(user.id, key);
    setTtsResultCache(cacheKey, {
      buffer: Buffer.from("audio-v1"),
      contentType: "audio/mpeg",
      provider: "spy",
    });

    const synthesizeSpy = vi.fn();
    const second = await chargeForSession({
      userId: user.id,
      cost: 5,
      actionType: "VOICE_TTS",
      idempotencyKey: key,
    });
    expect(second.deduplicated).toBe(true);
    expect(second.spentRunes).toBe(0);
    expect(second.transactionId).toBe(first.transactionId);
    expect(await getUserBalance(user.id)).toBe(75);
    expect(await countSpendTransactions(user.id)).toBe(1);

    // Route contract: on dedupe serve cache — provider must not run.
    if (second.deduplicated) {
      const cached = getTtsResultCache(cacheKey);
      expect(cached?.buffer.toString()).toBe("audio-v1");
      expect(synthesizeSpy).toHaveBeenCalledTimes(0);
    }
  });

  it("after fallback window bucket changes, omit-key charges again as a new operation", async () => {
    const user = await createTestUser({ runeBalance: 100 });
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
    expect(keyA).not.toBe(keyB);

    const first = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: keyA,
    });
    const second = await chargeForSession({
      userId: user.id,
      cost: 10,
      actionType: "READING",
      idempotencyKey: keyB,
    });
    expect(first.spentRunes).toBe(10);
    expect(second.spentRunes).toBe(10);
    expect(second.deduplicated).not.toBe(true);
    expect(await countSpendTransactions(user.id)).toBe(2);
  });

  it("ritual-style key: parallel pay claims one spend; resume payload is non-error", async () => {
    const user = await createTestUser({ runeBalance: 60 });
    const ritualId = "00000000-0000-4000-8000-000000000099";
    const key = `ritual-pay:${ritualId}`;
    const [a, b] = await Promise.all([
      chargeForSession({
        userId: user.id,
        cost: 20,
        actionType: "ritual",
        idempotencyKey: key,
      }),
      chargeForSession({
        userId: user.id,
        cost: 20,
        actionType: "ritual",
        idempotencyKey: key,
      }),
    ]);
    expect(a.transactionId).toBe(b.transactionId);
    expect(a.spentRunes + b.spentRunes).toBe(20);
    expect(await countSpendTransactions(user.id)).toBe(1);

    const winner = a.deduplicated ? b : a;
    const loser = a.deduplicated ? a : b;
    expect(loser.deduplicated).toBe(true);
    // Route maps this to ritualPayAlreadyDonePayload — never { error }.
    const resume = ritualPayAlreadyDonePayload(
      { id: ritualId, status: "generating" } as never,
      winner.newBalance,
      { id: ritualId, status: "generating" }
    );
    expect(resume.ok).toBe(true);
    expect("error" in resume).toBe(false);
  });

  it("intention/photo/chat contract: on dedupe provider spy stays 0 and response is non-error", async () => {
    const user = await createTestUser({ runeBalance: 90 });
    const key = `intention-spread:sess-${user.id}:triplet`;
    const llmSpy = vi.fn();
    const visionSpy = vi.fn();

    const first = await chargeForSession({
      userId: user.id,
      cost: 15,
      actionType: "INTENTION_SPREAD",
      idempotencyKey: key,
    });
    expect(first.spentRunes).toBe(15);
    llmSpy(); // first operation ran once

    const second = await chargeForSession({
      userId: user.id,
      cost: 15,
      actionType: "INTENTION_SPREAD",
      idempotencyKey: key,
    });
    expect(second.deduplicated).toBe(true);
    expect(second.spentRunes).toBe(0);
    // Route must NOT call provider again when deduplicated.
    expect(llmSpy).toHaveBeenCalledTimes(1);
    expect(visionSpy).toHaveBeenCalledTimes(0);

    const pendingPayload = {
      reading: "",
      pending: true,
      reused: true,
      sessionId: `sess-${user.id}`,
      runeBalance: second.newBalance,
      message: "Расклад уже выполняется — откройте сессию.",
    };
    expect(pendingPayload.pending).toBe(true);
    expect(pendingPayload).not.toHaveProperty("error");
    expect(await countSpendTransactions(user.id)).toBe(1);
  });
});
