import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import {
  assembleClientMemoryPackSync,
  buildClientMemoryPack,
  serializeClientMemoryPack,
} from "@/lib/memory/client-memory-pack";
import { loadClientMemoryBlock } from "@/lib/memory/client-memory";
import { computeCurrentStateSnapshots } from "@/lib/memory/current-state";
import { computeEpisodes, loadEpisodes } from "@/lib/memory/episodes";
import { personEntityKey } from "@/lib/memory/entities";
import { assessFreshness } from "@/lib/memory/freshness";
import { countUserMemoryIntelligence } from "@/lib/memory/intelligence-dirty";
import { rebuildUserMemoryIntelligence } from "@/lib/memory/intelligence-rebuild";
import { loadMemoryIntelligenceForPack, planMemoryIntelligence } from "@/lib/memory/intelligence-retrieve";
import { memoryBudgetFor } from "@/lib/memory/memory-budget";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";
import { expandMemoryQuery } from "@/lib/memory/query-expansion";
import {
  changeFact,
  deleteFact,
  listFactTimeline,
  purgeAllUserMemory,
  upsertFact,
} from "@/lib/memory/user-facts";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const SERGEY = personEntityKey("Сергей");
const IVAN = personEntityKey("Иван");

async function enableMemory(userId: string, sensitive = false) {
  await recordInitialMemoryChoice(userId, "enabled");
  if (sensitive) {
    await query(
      `UPDATE user_memory_preferences
          SET sensitive_capture_enabled = TRUE
        WHERE user_id = $1`,
      [userId]
    );
  }
}

async function backdateFact(userId: string, predicate: string, days: number) {
  await query(
    `UPDATE user_facts
        SET last_confirmed_at = NOW() - ($3 || ' days')::interval,
            valid_from = NOW() - ($3 || ' days')::interval,
            source_captured_at = NOW() - ($3 || ' days')::interval,
            updated_at = NOW() - ($3 || ' days')::interval
      WHERE user_id = $1 AND predicate_key = $2`,
    [userId, predicate, String(days)]
  );
}

describe.skipIf(!hasTestDb)("Memory Intelligence P1", () => {
  installDbLifecycle();

  const prevFlag = process.env.MEMORY_INTELLIGENCE_ENABLED;
  beforeEach(() => {
    process.env.MEMORY_INTELLIGENCE_ENABLED = "1";
  });
  afterEach(() => {
    if (prevFlag == null) delete process.env.MEMORY_INTELLIGENCE_ENABLED;
    else process.env.MEMORY_INTELLIGENCE_ENABLED = prevFlag;
  });

  it("A: work search → events → hired is one episode and current snapshot", async () => {
    const user = await createTestUser({ name: "Intel A" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу программистом",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "chat",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент проходит собеседования в банки",
      category: "work",
      predicateKey: "event.upcoming",
      eventDate: "2026-08-01",
      sourceType: "chat",
      salience: 3,
    });
    await upsertFact(user.id, {
      fact: "Клиент устроился программистом в банк",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 5,
    });
    const rebuilt = await rebuildUserMemoryIntelligence(user.id);
    expect(rebuilt.episodes).toBe(1);
    const facts = await listFactTimeline(user.id);
    const searching = facts.find((f) => f.predicateKey === "employment.searching");
    const current = facts.find((f) => f.predicateKey === "employment.current");
    expect(current?.status).toBe("active");
    expect(searching?.status).toBe("superseded");
    const snapshots = computeCurrentStateSnapshots(facts);
    const work = snapshots.find((s) => s.domain === "work");
    expect(work?.state.current).toBe(current?.id);
    expect(work?.state.searching).toBeNull();
    const episodes = computeEpisodes(facts).filter((e) => e.domain === "work");
    expect(episodes).toHaveLength(1);
    expect(episodes[0].supportingFactIds).toEqual(
      expect.arrayContaining([searching!.id, current!.id])
    );
  });

  it("B: Sergey query keeps only Sergey episode, not the later partner", async () => {
    const user = await createTestUser({ name: "Intel B" });
    await upsertFact(user.id, {
      fact: "Сергей бывший муж клиента",
      category: "relationship",
      predicateKey: "relationship.former_partner",
      entityKey: SERGEY,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент в разводе с Сергеем",
      category: "relationship",
      predicateKey: "relationship.divorce",
      entityKey: SERGEY,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент встречается с Иваном",
      category: "relationship",
      predicateKey: "relationship.partner",
      entityKey: IVAN,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const expansion = expandMemoryQuery("Что сейчас с Сергеем?", [SERGEY!, IVAN!]);
    const intel = await loadMemoryIntelligenceForPack(user.id, expansion);
    expect(intel).toBeTruthy();
    expect(intel!.episodes.every((e) => e.entityKey === SERGEY)).toBe(true);
    expect(intel!.episodes.some((e) => e.entityKey === IVAN)).toBe(false);
  });

  it("C: old searching is stale and not presented as confidently current", async () => {
    const user = await createTestUser({ name: "Intel C" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "chat",
      salience: 4,
    });
    await backdateFact(user.id, "employment.searching", 50);
    const facts = await listFactTimeline(user.id);
    const searching = facts.find((f) => f.predicateKey === "employment.searching");
    const fresh = assessFreshness({
      predicateKey: searching?.predicateKey,
      status: searching?.status,
      lastConfirmedAt: searching?.lastConfirmedAt,
      validFrom: searching?.validFrom,
      sourceCapturedAt: searching?.sourceCapturedAt,
      updatedAt: searching?.updatedAt,
    });
    expect(fresh.isStale).toBe(true);
    const pack = assembleClientMemoryPackSync({
      queryText: "Стоит ли менять работу?",
      candidates: facts,
      expansion: expandMemoryQuery("Стоит ли менять работу?"),
      depth: "standard",
      relevanceFlags: facts.map(() => true),
    });
    const block = serializeClientMemoryPack(pack, memoryBudgetFor("standard"));
    expect(block).toMatch(/freshness="stale"/);
    expect(block).toMatch(/актуальность не подтверждена/i);
    expect(block).not.toMatch(/<fact [^>]*freshness="stale"[^>]*>Клиент ищет работу<\/fact>/);
  });

  it("D: old family.child is not stale only because of age", async () => {
    const user = await createTestUser({ name: "Intel D" });
    await upsertFact(user.id, {
      fact: "У клиента есть дочь Маша",
      category: "family",
      predicateKey: "family.child",
      entityKey: personEntityKey("Маша"),
      sourceType: "user",
      sourceCharacter: "user",
      salience: 5,
    });
    await backdateFact(user.id, "family.child", 400);
    const facts = await listFactTimeline(user.id);
    const child = facts.find((f) => f.predicateKey === "family.child");
    const fresh = assessFreshness({
      predicateKey: child?.predicateKey,
      status: child?.status,
      lastConfirmedAt: child?.lastConfirmedAt,
    });
    expect(fresh.isStale).toBe(false);
    expect(fresh.label).toBe("fresh");
  });

  it("E: user job correction rebuilds snapshot and keeps old job in timeline", async () => {
    const user = await createTestUser({ name: "Intel E" });
    await upsertFact(user.id, {
      fact: "Клиент работает кассиром",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    const before = await listFactTimeline(user.id);
    const old = before.find((f) => f.predicateKey === "employment.current");
    expect(old).toBeTruthy();
    await changeFact(user.id, old!.id, "Клиент работает инженером в конструкторском бюро");
    await rebuildUserMemoryIntelligence(user.id);
    const facts = await listFactTimeline(user.id);
    const snapshots = computeCurrentStateSnapshots(facts);
    const work = snapshots.find((s) => s.domain === "work");
    const active = facts.find(
      (f) => f.predicateKey === "employment.current" && f.status === "active"
    );
    expect(active?.fact).toMatch(/инженером/);
    expect(work?.state.current).toBe(active?.id);
    expect(work?.state.current).not.toBe(old?.id);
    expect(facts.some((f) => f.id === old?.id && f.status === "superseded")).toBe(true);
  });

  it("F: delete supporting fact removes its id from episode/snapshot", async () => {
    const user = await createTestUser({ name: "Intel F" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "chat",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент устроился аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const before = await listFactTimeline(user.id);
    const searching = before.find((f) => f.predicateKey === "employment.searching");
    expect(searching).toBeTruthy();
    await deleteFact(user.id, searching!.id);
    await rebuildUserMemoryIntelligence(user.id);
    const after = await listFactTimeline(user.id);
    const episodes = computeEpisodes(after);
    const snapshots = computeCurrentStateSnapshots(after);
    expect(episodes.every((e) => !e.supportingFactIds.includes(searching!.id))).toBe(true);
    expect(snapshots.every((s) => !s.supportingFactIds.includes(searching!.id))).toBe(true);
  });

  it("G: purge removes raw facts, snapshots, episodes and dirty markers", async () => {
    const user = await createTestUser({ name: "Intel G" });
    await upsertFact(user.id, {
      fact: "Клиент живёт в Москве",
      category: "residence",
      predicateKey: "residence.current",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const before = await countUserMemoryIntelligence(user.id);
    expect(before.snapshots).toBeGreaterThan(0);
    await purgeAllUserMemory(user.id);
    const facts = await listFactTimeline(user.id);
    const counts = await countUserMemoryIntelligence(user.id);
    expect(facts).toHaveLength(0);
    expect(counts.snapshots).toBe(0);
    expect(counts.episodes).toBe(0);
    expect(counts.dirty).toBe(0);
  });

  it("H: episode from master A is available to master B query", async () => {
    const user = await createTestUser({ name: "Intel H" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу дизайнером",
      category: "work",
      predicateKey: "employment.searching",
      sourceType: "reading",
      sourceCharacter: "veronika",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const pack = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Стоит ли менять работу?",
      product: "natal",
    });
    expect(pack.episodes.some((e) => e.domain === "work")).toBe(true);
    expect(pack.currentSnapshots.some((s) => s.domain === "work")).toBe(true);
  });

  it("I: work query does not inject relationship episode", async () => {
    const user = await createTestUser({ name: "Intel I" });
    await upsertFact(user.id, {
      fact: "Клиент встречается с Иваном",
      category: "relationship",
      predicateKey: "relationship.partner",
      entityKey: IVAN,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const expansion = expandMemoryQuery("Стоит ли менять работу?");
    expect(planMemoryIntelligence(expansion).domains).toEqual(["work"]);
    const intel = await loadMemoryIntelligenceForPack(user.id, expansion);
    expect(intel!.episodes.every((e) => e.domain === "work")).toBe(true);
    expect(intel!.snapshots.every((s) => s.domain === "work")).toBe(true);
  });

  it("J: health snapshot follows sensitivity and is not injected into work queries", async () => {
    const user = await createTestUser({ name: "Intel J" });
    await enableMemory(user.id, true);
    await upsertFact(user.id, {
      fact: "У клиента хронический гастрит",
      category: "health",
      predicateKey: "health.condition",
      sensitivity: "sensitive",
      allowSensitive: true,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const health = await loadMemoryIntelligenceForPack(
      user.id,
      expandMemoryQuery("Что с моим здоровьем?")
    );
    const work = await loadMemoryIntelligenceForPack(
      user.id,
      expandMemoryQuery("Стоит ли менять работу?")
    );
    expect(health!.snapshots.some((s) => s.domain === "health")).toBe(true);
    expect(JSON.stringify(health!.snapshots)).not.toMatch(/гастрит/);
    expect(work!.snapshots.some((s) => s.domain === "health")).toBe(false);
  });

  it("K: intelligence unavailable still returns V3 raw memory", async () => {
    const user = await createTestUser({ name: "Intel K" });
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    const facts = await listFactTimeline(user.id);
    const pack = assembleClientMemoryPackSync({
      queryText: "Стоит ли менять работу?",
      candidates: facts,
      expansion: expandMemoryQuery("Стоит ли менять работу?"),
      depth: "standard",
      relevanceFlags: facts.map(() => true),
    });
    pack.currentSnapshots = [];
    pack.episodes = [];
    const block = serializeClientMemoryPack(pack, memoryBudgetFor("standard"));
    expect(block).toMatch(/аналитиком/);
    expect(block).not.toMatch(/<episode /);
  });

  it("L: rebuild of unchanged memory is idempotent", async () => {
    const user = await createTestUser({ name: "Intel L" });
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    const first = await rebuildUserMemoryIntelligence(user.id);
    const second = await rebuildUserMemoryIntelligence(user.id);
    expect(second.episodes).toBe(first.episodes);
    expect(second.snapshots).toBe(first.snapshots);
    const stored = await loadEpisodes(user.id);
    const keys = stored.map((e) => e.episodeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("memory-off does not inject intelligence even if derived rows exist", async () => {
    const user = await createTestUser({ name: "Intel Off" });
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await rebuildUserMemoryIntelligence(user.id);
    const loaded = await loadClientMemoryBlock({
      userId: user.id,
      queryText: "Стоит ли менять работу?",
    });
    expect(loaded.block).toBe("");
  });

  it("performance: snapshot/episode lookup stays indexed for 10..1000 facts", async () => {
    const user = await createTestUser({ name: "Intel Perf" });
    const sizes = [10, 100, 300, 1000];
    const timings: Array<{ n: number; snapshotMs: number; episodeMs: number; packMs: number }> = [];
    for (const n of sizes) {
      await query(`DELETE FROM user_facts WHERE user_id = $1`, [user.id]);
      await query(
        `INSERT INTO user_facts (user_id, fact, category, predicate_key, status, salience, source_type)
         SELECT $1, 'Синтетический факт ' || g || ' о работе и целях',
                'work', 'employment.current', 'active', 3, 'chat'
           FROM generate_series(1, $2) AS g`,
        [user.id, n]
      );
      await rebuildUserMemoryIntelligence(user.id);
      const snapStart = Date.now();
      await query(
        `SELECT domain FROM user_memory_state_snapshots WHERE user_id = $1 AND domain = 'work'`,
        [user.id]
      );
      const snapshotMs = Date.now() - snapStart;
      const epStart = Date.now();
      await query(
        `SELECT episode_key FROM user_memory_episodes WHERE user_id = $1 AND domain = 'work'`,
        [user.id]
      );
      const episodeMs = Date.now() - epStart;
      const facts = await listFactTimeline(user.id, n);
      const packStart = Date.now();
      assembleClientMemoryPackSync({
        queryText: "Стоит ли менять работу?",
        candidates: facts,
        expansion: expandMemoryQuery("Стоит ли менять работу?"),
        depth: "standard",
        relevanceFlags: facts.map(() => true),
      });
      timings.push({ n, snapshotMs, episodeMs, packMs: Date.now() - packStart });
    }
    for (const row of timings) {
      expect(row.snapshotMs).toBeLessThan(250);
      expect(row.episodeMs).toBeLessThan(250);
      expect(row.packMs).toBeLessThan(row.n >= 300 ? 800 : 400);
    }
  }, 60_000);
});
