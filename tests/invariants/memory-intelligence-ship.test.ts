import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import {
  buildClientMemoryPack,
  serializeClientMemoryPack,
} from "@/lib/memory/client-memory-pack";
import * as currentState from "@/lib/memory/current-state";
import { loadCurrentStateSnapshots } from "@/lib/memory/current-state";
import { loadEpisodes } from "@/lib/memory/episodes";
import { personEntityKey } from "@/lib/memory/entities";
import {
  countMemoryIntelligenceOps,
  countUserMemoryIntelligence,
  failUserMemoryIntelligenceDirty,
  markUserMemoryIntelligenceDirty,
  peekUserMemoryIntelligenceDirty,
  seedMemoryIntelligenceBackfill,
} from "@/lib/memory/intelligence-dirty";
import { rebuildUserMemoryIntelligence } from "@/lib/memory/intelligence-rebuild";
import { loadMemoryIntelligenceForPack } from "@/lib/memory/intelligence-retrieve";
import { memoryBudgetFor } from "@/lib/memory/memory-budget";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";
import { expandMemoryQuery } from "@/lib/memory/query-expansion";
import {
  INTELLIGENCE_REBUILD_MAX_PAGES,
  INTELLIGENCE_REBUILD_PAGE_SIZE,
  listFactsForIntelligenceRebuild,
  upsertFact,
} from "@/lib/memory/user-facts";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const SERGEY = personEntityKey("Сергей");
const WORK_Q = "Стоит ли менять работу?";

async function enableMemory(userId: string) {
  await recordInitialMemoryChoice(userId, "enabled");
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

describe.skipIf(!hasTestDb)("Memory Intelligence P1 ship hardening (db)", () => {
  installDbLifecycle();
  const prevFlag = process.env.MEMORY_INTELLIGENCE_ENABLED;
  beforeEach(() => {
    process.env.MEMORY_INTELLIGENCE_ENABLED = "1";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (prevFlag == null) delete process.env.MEMORY_INTELLIGENCE_ENABLED;
    else process.env.MEMORY_INTELLIGENCE_ENABLED = prevFlag;
  });

  it("dirty-read A–E: clean injects, dirty/failed hide derived, generation stays unread", async () => {
    const user = await createTestUser({ name: "Intel DirtyRead" });
    await enableMemory(user.id);
    const stored = await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    expect(stored).toBe(true);
    const firstId = (
      await query<{ id: string }>(
        `SELECT id FROM user_facts
          WHERE user_id = $1 AND fact = 'Клиент работает аналитиком' AND status = 'active'`,
        [user.id]
      )
    ).rows[0]?.id;
    expect(firstId).toBeTruthy();
    await rebuildUserMemoryIntelligence(user.id);

    const clean = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    const cleanXml = serializeClientMemoryPack(clean, memoryBudgetFor("standard"));
    expect(clean.currentSnapshots.some((s) => s.domain === "work")).toBe(true);
    expect(clean.currentSnapshots.some((s) => s.state.current === firstId)).toBe(true);
    expect(cleanXml).toMatch(/domain="work"/);
    expect(cleanXml).toContain(firstId);

    const storedB = await upsertFact(user.id, {
      fact: "Клиент работает инженером",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    expect(storedB).toBe(true);
    const secondId = (
      await query<{ id: string }>(
        `SELECT id FROM user_facts
          WHERE user_id = $1 AND fact = 'Клиент работает инженером' AND status = 'active'`,
        [user.id]
      )
    ).rows[0]?.id;
    expect(secondId).toBeTruthy();
    const dirtyCounts = await countUserMemoryIntelligence(user.id);
    expect(dirtyCounts.dirty).toBe(1);

    const dirtyPack = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    const dirtyXml = serializeClientMemoryPack(dirtyPack, memoryBudgetFor("standard"));
    expect(dirtyPack.currentSnapshots).toEqual([]);
    expect(dirtyPack.episodes).toEqual([]);
    expect(dirtyXml).not.toMatch(/<current_state /);
    expect(dirtyXml).not.toMatch(/<episode /);
    expect(dirtyXml).toMatch(/инженером/);
    expect(await loadCurrentStateSnapshots(user.id, ["work"])).toEqual([]);
    expect(await loadEpisodes(user.id, { domains: ["work"] })).toEqual([]);

    await rebuildUserMemoryIntelligence(user.id);
    const rebuilt = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(rebuilt.currentSnapshots.some((s) => s.state.current === secondId)).toBe(true);
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(0);

    await markUserMemoryIntelligenceDirty(user.id);
    const failedGen = await peekUserMemoryIntelligenceDirty(user.id);
    expect(failedGen).toBeTruthy();
    vi.spyOn(currentState, "persistCurrentStateSnapshots").mockRejectedValueOnce(
      new Error("rebuild_failed")
    );
    await expect(
      rebuildUserMemoryIntelligence(user.id, { generation: failedGen!.generation })
    ).rejects.toThrow("rebuild_failed");
    await failUserMemoryIntelligenceDirty(user.id, failedGen!.generation);
    const failedPack = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(failedPack.currentSnapshots).toEqual([]);
    expect(failedPack.episodes).toEqual([]);
    expect(serializeClientMemoryPack(failedPack, memoryBudgetFor("standard"))).toMatch(/инженером/);
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(1);

    await query(`DELETE FROM user_memory_intelligence_dirty WHERE user_id = $1`, [user.id]);
    await markUserMemoryIntelligenceDirty(user.id);
    const claimed = await peekUserMemoryIntelligenceDirty(user.id);
    expect(claimed).toBeTruthy();
    await query(
      `UPDATE user_memory_intelligence_dirty SET processing_at = NOW() WHERE user_id = $1`,
      [user.id]
    );
    await upsertFact(user.id, {
      fact: "Клиент работает архитектором",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id, { generation: claimed!.generation });
    const raced = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(raced.currentSnapshots).toEqual([]);
    expect(raced.episodes).toEqual([]);
    expect((await countUserMemoryIntelligence(user.id)).dirty).toBe(1);
  }, 60_000);

  it("backfill seeds eligible users and increments existing generation", async () => {
    const eligible = await createTestUser({ name: "Intel Backfill Yes" });
    const draftOnly = await createTestUser({ name: "Intel Backfill Draft" });
    const already = await createTestUser({ name: "Intel Backfill Gen" });
    await upsertFact(eligible.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await query(`DELETE FROM user_memory_intelligence_dirty WHERE user_id = $1`, [eligible.id]);
    await query(
      `INSERT INTO user_facts
         (user_id, fact, category, predicate_key, status, salience, source_type)
       VALUES ($1, 'черновик цели', 'goal', 'goal.current', 'draft', 2, 'chat')`,
      [draftOnly.id]
    );
    await query(
      `INSERT INTO user_facts
         (user_id, fact, category, predicate_key, status, salience, source_type)
       VALUES ($1, 'Клиент работает аналитиком', 'work', 'employment.current', 'active', 3, 'chat')`,
      [already.id]
    );
    await query(
      `INSERT INTO user_memory_intelligence_dirty
         (user_id, dirty_at, attempts, last_error, processing_at, generation)
       VALUES ($1, NOW(), 0, NULL, NULL, 5)`,
      [already.id]
    );

    const seeded = await seedMemoryIntelligenceBackfill({
      userIds: [eligible.id, draftOnly.id, already.id],
    });
    expect(seeded).toBeGreaterThan(0);
    const eligibleDirty = await countUserMemoryIntelligence(eligible.id);
    expect(eligibleDirty.dirty).toBe(1);
    const draftDirty = await countUserMemoryIntelligence(draftOnly.id);
    expect(draftDirty.dirty).toBe(0);
    const { rows } = await query<{ generation: number }>(
      `SELECT generation FROM user_memory_intelligence_dirty WHERE user_id = $1`,
      [already.id]
    );
    expect(Number(rows[0]?.generation)).toBe(6);

    const up = readFileSync(
      path.join(process.cwd(), "scripts/migrations/134_seed_memory_intelligence_backfill.sql"),
      "utf8"
    );
    const down = readFileSync(
      path.join(
        process.cwd(),
        "scripts/migrations/134_seed_memory_intelligence_backfill.down.sql"
      ),
      "utf8"
    );
    expect(up).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
    expect(up).toMatch(/generation = user_memory_intelligence_dirty\.generation \+ 1/);
    expect(down).not.toMatch(/DELETE FROM user_memory_intelligence_dirty/);
    expect(down).toMatch(/no-op/i);
  });

  it("truncation is reported when a further page exists past the cap", async () => {
    expect(INTELLIGENCE_REBUILD_PAGE_SIZE).toBe(250);
    expect(INTELLIGENCE_REBUILD_MAX_PAGES).toBe(40);
    const user = await createTestUser({ name: "Intel Trunc" });
    await query(
      `INSERT INTO user_facts
         (user_id, fact, category, predicate_key, status, salience, source_type, created_at)
       SELECT $1, 'синтетический факт ' || g, 'preference', 'preference.stated',
              'active', 2, 'chat', NOW() + (g || ' seconds')::interval
         FROM generate_series(1, 5) AS g`,
      [user.id]
    );
    const loaded = await listFactsForIntelligenceRebuild(user.id, {
      pageSize: 2,
      maxPages: 2,
    });
    expect(loaded.facts).toHaveLength(4);
    expect(loaded.truncated).toBe(true);
    const before = await countMemoryIntelligenceOps();
    const rebuilt = await rebuildUserMemoryIntelligence(user.id, {
      pageSize: 2,
      maxPages: 2,
    });
    expect(rebuilt.truncated).toBe(true);
    const after = await countMemoryIntelligenceOps();
    expect(after.memory_intelligence_rebuild_truncated_count).toBeGreaterThanOrEqual(
      before.memory_intelligence_rebuild_truncated_count + 1
    );
  });

  it("incremental derived read p95 stays under 100ms for clean and dirty users", async () => {
    const user = await createTestUser({ name: "Intel Latency" });
    await enableMemory(user.id);
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const expansion = expandMemoryQuery(WORK_Q);
    await loadMemoryIntelligenceForPack(user.id, expansion);

    const cleanMs: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const started = Date.now();
      const loaded = await loadMemoryIntelligenceForPack(user.id, expansion);
      cleanMs.push(Date.now() - started);
      expect(loaded?.snapshots.length).toBeGreaterThan(0);
    }
    await markUserMemoryIntelligenceDirty(user.id);
    const dirtyMs: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const started = Date.now();
      const loaded = await loadMemoryIntelligenceForPack(user.id, expansion);
      dirtyMs.push(Date.now() - started);
      expect(loaded?.snapshots).toEqual([]);
      expect(loaded?.episodes).toEqual([]);
    }
    const cleanP50 = percentile(cleanMs, 50);
    const cleanP95 = percentile(cleanMs, 95);
    const dirtyP50 = percentile(dirtyMs, 50);
    const dirtyP95 = percentile(dirtyMs, 95);
    console.log(
      `[memory-intelligence-latency] clean_p50=${cleanP50} clean_p95=${cleanP95} dirty_p50=${dirtyP50} dirty_p95=${dirtyP95}`
    );
    expect(cleanP95).toBeLessThan(100);
    expect(dirtyP95).toBeLessThan(100);
  });

  it("flag-on pack still excludes unrelated domains and named-entity episodes stay scoped", async () => {
    const user = await createTestUser({ name: "Intel FlagShip" });
    await enableMemory(user.id);
    await upsertFact(user.id, {
      fact: "Сергей бывший муж клиента",
      category: "relationship",
      predicateKey: "relationship.former_partner",
      entityKey: SERGEY,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const work = await buildClientMemoryPack({ userId: user.id, queryText: WORK_Q });
    expect(work.episodes.every((e) => e.domain !== "relationship")).toBe(true);
    const sergey = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Что сейчас с Сергеем?",
    });
    expect(sergey.episodes.every((e) => !e.entityKey || e.entityKey === SERGEY)).toBe(true);
  });
});
