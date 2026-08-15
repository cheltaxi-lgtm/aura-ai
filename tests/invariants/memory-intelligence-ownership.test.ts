import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import {
  buildClientMemoryPack,
  serializeClientMemoryPack,
} from "@/lib/memory/client-memory-pack";
import {
  claimDirtyIntelligenceUsers,
  clearUserMemoryIntelligenceDirty,
  countUserMemoryIntelligence,
  failUserMemoryIntelligenceDirty,
  isMemoryIntelligenceClaimCurrent,
  markUserMemoryIntelligenceDirty,
  peekUserMemoryIntelligenceDirty,
  releaseMemoryIntelligenceClaim,
} from "@/lib/memory/intelligence-dirty";
import { rebuildUserMemoryIntelligence } from "@/lib/memory/intelligence-rebuild";
import { memoryBudgetFor } from "@/lib/memory/memory-budget";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";
import { upsertFact } from "@/lib/memory/user-facts";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const WORK_Q = "Стоит ли менять работу?";

async function enableMemory(userId: string) {
  await recordInitialMemoryChoice(userId, "enabled");
}

async function workSnapshot(userId: string) {
  const { rows } = await query<{
    state_json: { current?: string | null; searching?: string | null };
  }>(
    `SELECT state_json FROM user_memory_state_snapshots
      WHERE user_id = $1 AND domain = 'work'`,
    [userId]
  );
  return rows[0]?.state_json ?? null;
}

async function expireLease(userId: string) {
  await query(
    `UPDATE user_memory_intelligence_dirty
        SET processing_at = NOW() - INTERVAL '11 minutes'
      WHERE user_id = $1`,
    [userId]
  );
}

describe.skipIf(!hasTestDb)("Memory Intelligence P1 claim ownership (db)", () => {
  installDbLifecycle();
  const prevFlag = process.env.MEMORY_INTELLIGENCE_ENABLED;
  beforeEach(() => {
    process.env.MEMORY_INTELLIGENCE_ENABLED = "1";
  });
  afterEach(() => {
    if (prevFlag == null) delete process.env.MEMORY_INTELLIGENCE_ENABLED;
    else process.env.MEMORY_INTELLIGENCE_ENABLED = prevFlag;
  });

  it("write during rebuild: A cannot persist stale state; B rebuilds current", async () => {
    const user = await createTestUser({ name: "Intel Own Conc" });
    await enableMemory(user.id);
    await upsertFact(user.id, {
      fact: "Клиент ищет работу",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "chat",
      salience: 4,
    });
    const claimsA = await claimDirtyIntelligenceUsers(50);
    const a = claimsA.find((row) => row.userId === user.id);
    expect(a).toBeTruthy();

    const resultA = await rebuildUserMemoryIntelligence(user.id, {
      generation: a!.generation,
      processingAt: a!.processingAt,
      beforePersist: async () => {
        await upsertFact(user.id, {
          fact: "Клиент работает аналитиком",
          category: "work",
          predicateKey: "employment.current",
          sourceType: "chat",
          salience: 4,
        });
        const peek = await peekUserMemoryIntelligenceDirty(user.id);
        expect(peek?.generation).toBe(a!.generation + 1);
        expect(peek?.processingAt).toBe(a!.processingAt);
        const stolen = await claimDirtyIntelligenceUsers(50);
        expect(stolen.every((row) => row.userId !== user.id)).toBe(true);
      },
    });
    expect(resultA.skipped).toBe(true);
    expect(resultA.snapshots).toBe(0);

    const afterA = await peekUserMemoryIntelligenceDirty(user.id);
    expect(afterA?.generation).toBe(a!.generation + 1);
    expect(afterA?.processingAt).toBeNull();
    const dirtyPack = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(dirtyPack.currentSnapshots).toEqual([]);
    expect(dirtyPack.episodes).toEqual([]);

    const claimsB = await claimDirtyIntelligenceUsers(50);
    const b = claimsB.find((row) => row.userId === user.id);
    expect(b).toBeTruthy();
    const resultB = await rebuildUserMemoryIntelligence(user.id, {
      generation: b!.generation,
      processingAt: b!.processingAt,
    });
    expect(resultB.skipped).toBe(false);
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(0);

    const state = await workSnapshot(user.id);
    const { rows: current } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id = $1 AND predicate_key = 'employment.current' AND status = 'active'`,
      [user.id]
    );
    const { rows: searching } = await query<{ status: string }>(
      `SELECT status FROM user_facts
        WHERE user_id = $1 AND predicate_key = 'employment.searching'`,
      [user.id]
    );
    expect(state?.current).toBe(current[0]?.id);
    expect(searching[0]?.status).toBe("superseded");
    const clean = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(clean.currentSnapshots.some((s) => s.state.current === current[0]?.id)).toBe(true);
    expect(clean.episodes.some((e) => e.domain === "work")).toBe(true);
    expect(serializeClientMemoryPack(clean, memoryBudgetFor("standard"))).toMatch(/domain="work"/);
  }, 60_000);

  it("expired lease takeover: A cannot persist, clear, or release B's token", async () => {
    const user = await createTestUser({ name: "Intel Own Lease" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "chat",
      salience: 4,
    });
    const claimsA = await claimDirtyIntelligenceUsers(50);
    const a = claimsA.find((row) => row.userId === user.id);
    expect(a).toBeTruthy();
    await expireLease(user.id);

    const claimsB = await claimDirtyIntelligenceUsers(50);
    const b = claimsB.find((row) => row.userId === user.id);
    expect(b).toBeTruthy();
    expect(b!.processingAt).not.toBe(a!.processingAt);

    expect(await isMemoryIntelligenceClaimCurrent(user.id, a!.generation, a!.processingAt)).toBe(
      false
    );
    expect(await isMemoryIntelligenceClaimCurrent(user.id, b!.generation, b!.processingAt)).toBe(
      true
    );
    expect(await releaseMemoryIntelligenceClaim(user.id, a!.processingAt)).toBe(false);
    expect(await clearUserMemoryIntelligenceDirty(user.id, a!.generation, a!.processingAt)).toBe(
      false
    );
    await failUserMemoryIntelligenceDirty(user.id, a!.generation, a!.processingAt);
    const stillB = await peekUserMemoryIntelligenceDirty(user.id);
    expect(stillB?.processingAt).toBe(b!.processingAt);
    expect(stillB?.generation).toBe(b!.generation);

    const skipped = await rebuildUserMemoryIntelligence(user.id, {
      generation: a!.generation,
      processingAt: a!.processingAt,
    });
    expect(skipped.skipped).toBe(true);
    const owned = await peekUserMemoryIntelligenceDirty(user.id);
    expect(owned?.processingAt).toBe(b!.processingAt);
  });

  it("out-of-order persist after B acked cannot replace current with stale searching", async () => {
    const user = await createTestUser({ name: "Intel Own Order" });
    await enableMemory(user.id);
    await upsertFact(user.id, {
      fact: "Клиент ищет работу",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "chat",
      salience: 4,
    });
    const claimsA = await claimDirtyIntelligenceUsers(50);
    const a = claimsA.find((row) => row.userId === user.id);
    expect(a).toBeTruthy();

    const resultA = await rebuildUserMemoryIntelligence(user.id, {
      generation: a!.generation,
      processingAt: a!.processingAt,
      beforePersist: async () => {
        await upsertFact(user.id, {
          fact: "Клиент работает аналитиком",
          category: "work",
          predicateKey: "employment.current",
          sourceType: "chat",
          salience: 4,
        });
        await expireLease(user.id);
        const claimsB = await claimDirtyIntelligenceUsers(50);
        const b = claimsB.find((row) => row.userId === user.id);
        expect(b).toBeTruthy();
        const resultB = await rebuildUserMemoryIntelligence(user.id, {
          generation: b!.generation,
          processingAt: b!.processingAt,
        });
        expect(resultB.skipped).toBe(false);
        expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(0);
      },
    });
    expect(resultA.skipped).toBe(true);

    const { rows: current } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id = $1 AND predicate_key = 'employment.current' AND status = 'active'`,
      [user.id]
    );
    const state = await workSnapshot(user.id);
    expect(state?.current).toBe(current[0]?.id);
    expect(state?.current).toBeTruthy();
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(0);
    const pack = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(pack.currentSnapshots.some((s) => s.state.current === current[0]?.id)).toBe(true);
  }, 60_000);
});
