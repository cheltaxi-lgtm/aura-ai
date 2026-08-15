import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { buildClientMemoryPack } from "@/lib/memory/client-memory-pack";
import {
  claimDirtyIntelligenceUsers,
  countUserMemoryIntelligence,
  peekUserMemoryIntelligenceDirty,
  purgeUserMemoryIntelligence,
  releaseMemoryIntelligenceClaim,
} from "@/lib/memory/intelligence-dirty";
import { rebuildUserMemoryIntelligence } from "@/lib/memory/intelligence-rebuild";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";
import { purgeAllUserMemory, purgeFacts, upsertFact } from "@/lib/memory/user-facts";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const WORK_Q = "Стоит ли менять работу?";

async function enableMemory(userId: string) {
  await recordInitialMemoryChoice(userId, "enabled");
}

/** Same atomic reservation as scripts/memory-smoke-test.ts (disposable INTEL). */
async function reserveSmokeIntelligenceLease(userId: string): Promise<{
  generation: number;
  processingAt: string;
}> {
  const { rows } = await query<{ generation: string; processing_at: string }>(
    `INSERT INTO user_memory_intelligence_dirty (
       user_id, dirty_at, attempts, last_error, processing_at, generation
     ) VALUES ($1, NOW(), 0, NULL, NOW(), 1)
     ON CONFLICT (user_id) DO UPDATE SET
       dirty_at = NOW(),
       last_error = NULL,
       generation = user_memory_intelligence_dirty.generation + 1,
       processing_at = NOW()
     RETURNING generation::text AS generation,
               processing_at::text AS processing_at`,
    [userId]
  );
  const row = rows[0];
  if (!row?.processing_at) {
    throw new Error("smoke lease reservation failed");
  }
  return { generation: Number(row.generation), processingAt: row.processing_at };
}

async function leftoverCounts(userId: string) {
  const [facts, snapshots, episodes, dirty] = await Promise.all([
    query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM user_facts WHERE user_id=$1`, [userId]),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM user_memory_state_snapshots WHERE user_id=$1`,
      [userId]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM user_memory_episodes WHERE user_id=$1`,
      [userId]
    ),
    query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM user_memory_intelligence_dirty WHERE user_id=$1`,
      [userId]
    ),
  ]);
  return {
    facts: Number(facts.rows[0]?.n ?? 0),
    snapshots: Number(snapshots.rows[0]?.n ?? 0),
    episodes: Number(episodes.rows[0]?.n ?? 0),
    dirty: Number(dirty.rows[0]?.n ?? 0),
  };
}

async function cleanupSyntheticUser(userId: string) {
  await purgeAllUserMemory(userId).catch(() => {});
  await purgeFacts(userId).catch(() => {});
  await purgeUserMemoryIntelligence(userId).catch(() => {});
  await query(`DELETE FROM user_memory_state_snapshots WHERE user_id=$1`, [userId]).catch(() => {});
  await query(`DELETE FROM user_memory_episodes WHERE user_id=$1`, [userId]).catch(() => {});
  await query(`DELETE FROM user_memory_intelligence_dirty WHERE user_id=$1`, [userId]).catch(
    () => {}
  );
}

describe.skipIf(!hasTestDb)("Memory Intelligence P1 smoke lease vs live worker (db)", () => {
  installDbLifecycle();
  const prevFlag = process.env.MEMORY_INTELLIGENCE_ENABLED;
  beforeEach(() => {
    process.env.MEMORY_INTELLIGENCE_ENABLED = "1";
  });
  afterEach(() => {
    if (prevFlag == null) delete process.env.MEMORY_INTELLIGENCE_ENABLED;
    else process.env.MEMORY_INTELLIGENCE_ENABLED = prevFlag;
  });

  it("reserved smoke lease survives upsert + claim; dirty hides derived; release then rebuild", async () => {
    const user = await createTestUser({ name: "Intel Smoke Lease" });
    await enableMemory(user.id);
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const clean = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(clean.currentSnapshots.some((s) => s.domain === "work")).toBe(true);
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(0);

    const lease = await reserveSmokeIntelligenceLease(user.id);
    expect(lease.processingAt).toBeTruthy();

    await upsertFact(user.id, {
      fact: "Клиент работает инженером",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    const { rows: engineerRows } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id=$1 AND predicate_key='employment.current' AND status='active'`,
      [user.id]
    );
    const engineerId = engineerRows[0]?.id;
    expect(engineerId).toBeTruthy();

    const afterUpsert = await peekUserMemoryIntelligenceDirty(user.id);
    const { rows: stillLease } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM user_memory_intelligence_dirty
        WHERE user_id=$1 AND processing_at=$2::timestamptz`,
      [user.id, lease.processingAt]
    );
    expect(Number(stillLease[0]?.n ?? 0)).toBe(1);
    expect(afterUpsert?.generation).toBeGreaterThan(lease.generation);

    const stolen = await claimDirtyIntelligenceUsers(50);
    expect(stolen.some((row) => row.userId === user.id)).toBe(false);
    const { rows: stillOwned } = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM user_memory_intelligence_dirty
        WHERE user_id=$1 AND processing_at=$2::timestamptz`,
      [user.id, lease.processingAt]
    );
    expect(Number(stillOwned[0]?.n ?? 0)).toBe(1);

    const dirtyPack = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(dirtyPack.currentSnapshots).toHaveLength(0);
    expect(dirtyPack.episodes).toHaveLength(0);

    expect(await releaseMemoryIntelligenceClaim(user.id, "2000-01-01T00:00:00.000Z")).toBe(
      false
    );
    const notStolen = await peekUserMemoryIntelligenceDirty(user.id);
    expect(notStolen?.processingAt).toBe(lease.processingAt);

    expect(await releaseMemoryIntelligenceClaim(user.id, lease.processingAt)).toBe(true);
    const released = await peekUserMemoryIntelligenceDirty(user.id);
    expect(released).toBeTruthy();
    expect(released?.processingAt).toBeNull();
    expect(released?.generation).toBe(afterUpsert?.generation);

    const rebuilt = await rebuildUserMemoryIntelligence(user.id);
    expect(rebuilt.skipped).toBe(false);
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(0);
    const after = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(after.currentSnapshots.some((s) => s.domain === "work")).toBe(true);
    expect(after.currentSnapshots.some((s) => s.state.current === engineerId)).toBe(true);
  }, 60_000);

  it("cleanup after reserved smoke lease leaves no synthetic leftovers", async () => {
    const user = await createTestUser({ name: "Intel Smoke Cleanup" });
    await enableMemory(user.id);
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    const lease = await reserveSmokeIntelligenceLease(user.id);
    expect(lease.processingAt).toBeTruthy();
    expect((await leftoverCounts(user.id)).dirty).toBe(1);

    await cleanupSyntheticUser(user.id);
    expect(await leftoverCounts(user.id)).toEqual({
      facts: 0,
      snapshots: 0,
      episodes: 0,
      dirty: 0,
    });
  });
});
