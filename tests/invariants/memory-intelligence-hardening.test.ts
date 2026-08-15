import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "@/lib/db";
import {
  buildClientMemoryPack,
  serializeClientMemoryPack,
} from "@/lib/memory/client-memory-pack";
import { computeCurrentStateSnapshots, isWorkRelatedGoal } from "@/lib/memory/current-state";
import { computeEpisodes, EPISODE_GAP_DAYS } from "@/lib/memory/episodes";
import { personEntityKey } from "@/lib/memory/entities";
import {
  claimDirtyIntelligenceUsers,
  countUserMemoryIntelligence,
  failUserMemoryIntelligenceDirty,
  markUserMemoryIntelligenceDirty,
} from "@/lib/memory/intelligence-dirty";
import { rebuildUserMemoryIntelligence } from "@/lib/memory/intelligence-rebuild";
import * as currentState from "@/lib/memory/current-state";
import { loadMemoryIntelligenceForPack, serializeIntelligenceXml } from "@/lib/memory/intelligence-retrieve";
import { memoryBudgetFor } from "@/lib/memory/memory-budget";
import { expandMemoryQuery } from "@/lib/memory/query-expansion";
import { upsertFact, type UserFact } from "@/lib/memory/user-facts";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

const SERGEY = personEntityKey("Сергей");
const IVAN = personEntityKey("Иван");
const NOW = new Date("2026-08-14T12:00:00Z");

function fact(partial: Partial<UserFact> & { id: string; fact: string }): UserFact {
  return {
    category: "other",
    eventDate: null,
    sourceCharacter: null,
    salience: 3,
    status: "active",
    subjectKey: "client",
    ...partial,
  };
}

describe("Memory Intelligence P1 hardening (pure)", () => {
  it("work snapshot includes only work-scoped goals", () => {
    const workGoal = fact({
      id: "11111111-1111-1111-1111-111111111111",
      fact: "Хочу сменить работу",
      predicateKey: "goal.current",
      category: "work",
    });
    const relGoal = fact({
      id: "22222222-2222-2222-2222-222222222222",
      fact: "Хочу восстановить отношения",
      predicateKey: "goal.current",
      category: "relationship",
    });
    const job = fact({
      id: "33333333-3333-3333-3333-333333333333",
      fact: "Клиент работает аналитиком",
      predicateKey: "employment.current",
      category: "work",
    });
    expect(isWorkRelatedGoal(workGoal)).toBe(true);
    expect(isWorkRelatedGoal(relGoal)).toBe(false);
    const snapshots = computeCurrentStateSnapshots([workGoal, relGoal, job], NOW);
    const work = snapshots.find((s) => s.domain === "work");
    const goals = snapshots.find((s) => s.domain === "goals");
    expect(work?.state.goals).toEqual([workGoal.id]);
    expect(work?.state.goals).not.toContain(relGoal.id);
    expect(goals?.state.current).toEqual(expect.arrayContaining([workGoal.id, relGoal.id]));
  });

  it("serializes every documented snapshot slot when the fact is already selected", () => {
    const selected: UserFact[] = [
      fact({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", fact: "работа", predicateKey: "employment.current" }),
      fact({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", fact: "поиск", predicateKey: "employment.searching" }),
      fact({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", fact: "бывшая работа", predicateKey: "employment.former" }),
      fact({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4", fact: "цель работы", predicateKey: "goal.current", category: "work" }),
      fact({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1", fact: "статус", predicateKey: "relationship.status" }),
      fact({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2", fact: "партнёр", predicateKey: "relationship.partner" }),
      fact({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3", fact: "бывший", predicateKey: "relationship.former_partner" }),
      fact({ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4", fact: "развод", predicateKey: "relationship.divorce" }),
      fact({ id: "cccccccc-cccc-cccc-cccc-ccccccccccc1", fact: "ребёнок", predicateKey: "family.child" }),
      fact({ id: "cccccccc-cccc-cccc-cccc-ccccccccccc2", fact: "родитель", predicateKey: "family.parent" }),
      fact({ id: "cccccccc-cccc-cccc-cccc-ccccccccccc3", fact: "родственник", predicateKey: "family.relative" }),
      fact({ id: "cccccccc-cccc-cccc-cccc-ccccccccccc4", fact: "супруг", predicateKey: "family.spouse" }),
      fact({ id: "dddddddd-dddd-dddd-dddd-ddddddddddd1", fact: "диагноз", predicateKey: "health.condition" }),
      fact({ id: "dddddddd-dddd-dddd-dddd-ddddddddddd2", fact: "процедура", predicateKey: "health.procedure" }),
      fact({ id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1", fact: "цель", predicateKey: "goal.current", category: "goal" }),
      fact({ id: "ffffffff-ffff-ffff-ffff-fffffffffff1", fact: "город", predicateKey: "residence.current" }),
      fact({ id: "ffffffff-ffff-ffff-ffff-fffffffffff2", fact: "старый город", predicateKey: "residence.former" }),
      fact({ id: "99999999-9999-9999-9999-999999999991", fact: "учёба", predicateKey: "education.current" }),
      fact({ id: "99999999-9999-9999-9999-999999999992", fact: "диплом", predicateKey: "education.former" }),
      fact({ id: "88888888-8888-8888-8888-888888888881", fact: "долг", predicateKey: "finance.debt" }),
    ];
    const snapshots = computeCurrentStateSnapshots(selected, NOW);
    const xml = serializeIntelligenceXml(snapshots, [], selected, NOW);
    expect(xml).toMatch(/domain="work"[\s\S]*name="current"/);
    expect(xml).toMatch(/domain="work"[\s\S]*name="searching"/);
    expect(xml).toMatch(/domain="work"[\s\S]*name="former"/);
    expect(xml).toMatch(/domain="work"[\s\S]*name="goals"/);
    expect(xml).toMatch(/domain="relationship"[\s\S]*name="status"/);
    expect(xml).toMatch(/domain="relationship"[\s\S]*name="partner"/);
    expect(xml).toMatch(/domain="relationship"[\s\S]*name="former"/);
    expect(xml).toMatch(/domain="relationship"[\s\S]*name="divorce"/);
    expect(xml).toMatch(/domain="family"[\s\S]*name="children"/);
    expect(xml).toMatch(/domain="family"[\s\S]*name="parents"/);
    expect(xml).toMatch(/domain="family"[\s\S]*name="relatives"/);
    expect(xml).toMatch(/domain="family"[\s\S]*name="spouse"/);
    expect(xml).toMatch(/domain="health"[\s\S]*name="conditions"/);
    expect(xml).toMatch(/domain="health"[\s\S]*name="procedures"/);
    expect(xml).toMatch(/domain="goals"[\s\S]*name="current"/);
    expect(xml).toMatch(/domain="residence"[\s\S]*name="current"/);
    expect(xml).toMatch(/domain="residence"[\s\S]*name="former"/);
    expect(xml).toMatch(/domain="education"[\s\S]*name="current"/);
    expect(xml).toMatch(/domain="education"[\s\S]*name="former"/);
    expect(xml).toMatch(/domain="money"[\s\S]*name="debts"/);
    expect(xml).not.toMatch(/непрошедший/);
  });

  it("does not serialize a snapshot slot unless the raw fact is already selected", () => {
    const stored = fact({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      fact: "Клиент работает аналитиком",
      predicateKey: "employment.current",
      category: "work",
    });
    const snapshots = computeCurrentStateSnapshots([stored], NOW);
    const xml = serializeIntelligenceXml(snapshots, [], [], NOW);
    expect(xml).toBe("");
  });

  it("A: one work transition stays one episode", () => {
    const facts = [
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        fact: "ищет",
        predicateKey: "employment.searching",
        category: "work",
        validFrom: "2026-01-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        fact: "собеседование",
        predicateKey: "event.upcoming",
        category: "work",
        validFrom: "2026-02-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        fact: "устроился",
        predicateKey: "employment.current",
        category: "work",
        validFrom: "2026-03-01T00:00:00Z",
      }),
    ];
    expect(computeEpisodes(facts, NOW).filter((e) => e.domain === "work")).toHaveLength(1);
  });

  it("B: two distant work periods become two episodes", () => {
    const facts = [
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        fact: "работал в 2020",
        predicateKey: "employment.current",
        category: "work",
        validFrom: "2020-01-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        fact: "работает в 2026",
        predicateKey: "employment.current",
        category: "work",
        validFrom: "2026-01-01T00:00:00Z",
      }),
    ];
    const work = computeEpisodes(facts, NOW).filter((e) => e.domain === "work");
    expect(work).toHaveLength(2);
    expect(EPISODE_GAP_DAYS.work).toBe(180);
  });

  it("C: two distant unnamed trips become two event episodes", () => {
    const facts = [
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        fact: "поездка в Казань",
        predicateKey: "event.upcoming",
        category: "event",
        eventDate: "2024-06-01",
        validFrom: "2024-06-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        fact: "поездка в Сочи",
        predicateKey: "event.upcoming",
        category: "event",
        eventDate: "2026-07-01",
        validFrom: "2026-07-01T00:00:00Z",
      }),
    ];
    expect(computeEpisodes(facts, NOW).filter((e) => e.domain === "event")).toHaveLength(2);
  });

  it("D/E: Сергей stays together; Иван is a separate episode", () => {
    const facts = [
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        fact: "Сергей бывший муж",
        predicateKey: "relationship.former_partner",
        entityKey: SERGEY,
        validFrom: "2018-01-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        fact: "развод с Сергеем",
        predicateKey: "relationship.divorce",
        entityKey: SERGEY,
        validFrom: "2020-01-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        fact: "Иван партнёр",
        predicateKey: "relationship.partner",
        entityKey: IVAN,
        validFrom: "2024-01-01T00:00:00Z",
      }),
    ];
    const episodes = computeEpisodes(facts, NOW);
    const sergey = episodes.filter((e) => e.entityKey === SERGEY);
    const ivan = episodes.filter((e) => e.entityKey === IVAN);
    expect(sergey).toHaveLength(1);
    expect(ivan).toHaveLength(1);
    expect(sergey[0].supportingFactIds).toHaveLength(2);
  });

  it("F: rebuild of the same facts is idempotent", () => {
    const facts = [
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        fact: "ищет",
        predicateKey: "employment.searching",
        category: "work",
        validFrom: "2026-01-01T00:00:00Z",
      }),
      fact({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        fact: "устроился",
        predicateKey: "employment.current",
        category: "work",
        validFrom: "2026-03-01T00:00:00Z",
      }),
    ];
    const first = computeEpisodes(facts, NOW).map((e) => e.episodeKey);
    const second = computeEpisodes(facts, NOW).map((e) => e.episodeKey);
    expect(second).toEqual(first);
    expect(new Set(second).size).toBe(second.length);
  });
});

describe.skipIf(!hasTestDb)("Memory Intelligence P1 hardening (db)", () => {
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

  it("dirty race A: write during claimed rebuild keeps the user dirty", async () => {
    const user = await createTestUser({ name: "Dirty A" });
    await markUserMemoryIntelligenceDirty(user.id);
    const claims = await claimDirtyIntelligenceUsers(1);
    expect(claims).toHaveLength(1);
    await markUserMemoryIntelligenceDirty(user.id);
    await rebuildUserMemoryIntelligence(user.id, {
      generation: claims[0].generation,
      processingAt: claims[0].processingAt,
    });
    const counts = await countUserMemoryIntelligence(user.id);
    expect(counts.dirty).toBe(1);
  });

  it("dirty race B: successful rebuild without new writes clears dirty", async () => {
    const user = await createTestUser({ name: "Dirty B" });
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await markUserMemoryIntelligenceDirty(user.id);
    const claims = await claimDirtyIntelligenceUsers(1);
    expect(claims).toHaveLength(1);
    await rebuildUserMemoryIntelligence(user.id, {
      generation: claims[0].generation,
      processingAt: claims[0].processingAt,
    });
    const counts = await countUserMemoryIntelligence(user.id);
    expect(counts.dirty).toBe(0);
    expect(counts.snapshots).toBeGreaterThan(0);
  });

  it("dirty race C: failed rebuild stays retryable", async () => {
    const user = await createTestUser({ name: "Dirty C" });
    await markUserMemoryIntelligenceDirty(user.id);
    const claims = await claimDirtyIntelligenceUsers(1);
    expect(claims).toHaveLength(1);
    await failUserMemoryIntelligenceDirty(user.id, claims[0].generation, claims[0].processingAt);
    const again = await claimDirtyIntelligenceUsers(1);
    expect(again.some((row) => row.userId === user.id)).toBe(true);
  });

  it("rebuild past the first 400 facts still sees an older distinctive fact", async () => {
    const user = await createTestUser({ name: "Intel 1000" });
    await query(
      `INSERT INTO user_facts
         (user_id, fact, category, predicate_key, status, archive_tier, salience, source_type, created_at)
       SELECT $1,
              'Синтетическое предпочтение ' || g,
              'preference',
              'preference.stated',
              'active',
              'hot',
              2,
              'chat',
              NOW()
         FROM generate_series(1, 1000) AS g`,
      [user.id]
    );
    await query(
      `INSERT INTO user_facts
         (user_id, fact, category, predicate_key, status, archive_tier, salience, source_type, created_at)
       VALUES ($1, 'Клиент работал на заводе в 2010 году', 'work', 'employment.current',
               'active', 'archived', 5, 'chat', '2010-01-01T00:00:00Z')`,
      [user.id]
    );
    await rebuildUserMemoryIntelligence(user.id);
    const { rows } = await query<{ state_json: { current?: string | null } }>(
      `SELECT state_json FROM user_memory_state_snapshots
        WHERE user_id = $1 AND domain = 'work'`,
      [user.id]
    );
    expect(rows[0]?.state_json?.current).toBeTruthy();
    const { rows: facts } = await query<{ id: string }>(
      `SELECT id FROM user_facts
        WHERE user_id = $1 AND predicate_key = 'employment.current'`,
      [user.id]
    );
    expect(rows[0]?.state_json?.current).toBe(facts[0]?.id);
  }, 60_000);

  it("flag-on integration: work / family / health / goals / Sergey / stale / exclusion / fallback", async () => {
    const user = await createTestUser({ name: "Intel FlagOn" });
    await upsertFact(user.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Хочу сменить работу",
      category: "work",
      predicateKey: "goal.current",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Мама клиента живёт в Казани",
      category: "family",
      predicateKey: "family.parent",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент делал операцию на колене",
      category: "health",
      predicateKey: "health.procedure",
      sensitivity: "sensitive",
      allowSensitive: true,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Сергей бывший муж клиента",
      category: "relationship",
      predicateKey: "relationship.former_partner",
      entityKey: SERGEY,
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await query(
      `INSERT INTO user_facts (
         user_id, fact, category, predicate_key, status, salience, source_type,
         last_confirmed_at, valid_from, source_captured_at, updated_at
       ) VALUES (
         $1, 'Клиент ищет подработку', 'work', 'employment.searching', 'active', 3, 'chat',
         NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days',
         NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days'
       )`,
      [user.id]
    );
    await rebuildUserMemoryIntelligence(user.id);

    const work = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Стоит ли менять работу?",
    });
    const workXml = serializeClientMemoryPack(work, memoryBudgetFor("standard"));
    expect(work.currentSnapshots.some((s) => s.domain === "work")).toBe(true);
    expect(workXml).toMatch(/domain="work"/);
    expect(workXml).toMatch(/актуальность не подтверждена|freshness="stale"/);
    expect(work.episodes.every((e) => e.domain !== "relationship")).toBe(true);

    const family = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Как дела у родителей?",
    });
    expect(serializeClientMemoryPack(family, memoryBudgetFor("standard"))).toMatch(
      /name="parents"|family\.parent/
    );

    const health = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Что с операцией на колене?",
    });
    expect(serializeClientMemoryPack(health, memoryBudgetFor("standard"))).toMatch(
      /name="procedures"|health\.procedure/
    );

    const goals = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Какие у меня цели?",
    });
    expect(serializeClientMemoryPack(goals, memoryBudgetFor("standard"))).toMatch(
      /domain="goals"|goal\.current/
    );

    const sergey = await buildClientMemoryPack({
      userId: user.id,
      queryText: "Что сейчас с Сергеем?",
    });
    expect(sergey.episodes.every((e) => !e.entityKey || e.entityKey === SERGEY)).toBe(true);
    expect(sergey.expansion.entityKeys).toContain(SERGEY);

    const emptyUser = await createTestUser({ name: "Intel Fallback" });
    await upsertFact(emptyUser.id, {
      fact: "Клиент работает аналитиком",
      category: "work",
      predicateKey: "employment.current",
      sourceType: "chat",
      salience: 4,
    });
    const fallback = await buildClientMemoryPack({
      userId: emptyUser.id,
      queryText: "Стоит ли менять работу?",
    });
    const fallbackXml = serializeClientMemoryPack(fallback, memoryBudgetFor("standard"));
    expect(fallbackXml).toMatch(/аналитиком/);
    expect(fallback.currentSnapshots).toEqual([]);
    expect(fallback.episodes).toEqual([]);

    vi.spyOn(currentState, "loadCurrentStateSnapshots").mockRejectedValueOnce(
      new Error("unavailable")
    );
    const failed = await loadMemoryIntelligenceForPack(
      emptyUser.id,
      expandMemoryQuery("Стоит ли менять работу?")
    );
    expect(failed).toBeNull();
  });
});
