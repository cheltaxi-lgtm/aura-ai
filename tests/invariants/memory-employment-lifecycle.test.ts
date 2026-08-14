import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { searchFacts, upsertFact } from "@/lib/memory/user-facts";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";

type EmpRow = {
  predicate_key: string;
  status: string;
  valid_from: Date | string | null;
  valid_to: Date | string | null;
};

async function empRows(userId: string): Promise<EmpRow[]> {
  const { rows } = await query<EmpRow>(
    `SELECT predicate_key, status, valid_from, valid_to
       FROM user_facts
      WHERE user_id = $1
        AND predicate_key IN ('employment.searching','employment.current')
      ORDER BY created_at`,
    [userId]
  );
  return rows;
}

describe.skipIf(!hasTestDb)("memory employment lifecycle (db)", () => {
  installDbLifecycle();

  it("A: auto searching → auto current supersedes and leaves one active", async () => {
    const user = await createTestUser({ name: "Emp A" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу программистом",
      category: "work",
      predicateKey: "employment.searching",
      operation: "replace",
      sourceType: "chat",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент устроился программистом в банк",
      category: "work",
      predicateKey: "employment.current",
      operation: "replace",
      sourceType: "chat",
      salience: 4,
    });
    const rows = await empRows(user.id);
    const searching = rows.find((r) => r.predicate_key === "employment.searching");
    const current = rows.find((r) => r.predicate_key === "employment.current");
    expect(searching?.status).toBe("superseded");
    expect(searching?.valid_to).toBeTruthy();
    expect(current?.status).toBe("active");
    expect(current?.valid_from).toBeTruthy();
    expect(rows.filter((r) => r.status === "active")).toHaveLength(1);
  });

  it("B: auto current cannot destroy manual searching", async () => {
    const user = await createTestUser({ name: "Emp B" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу программистом",
      category: "work",
      predicateKey: "employment.searching",
      operation: "replace",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент устроился программистом в банк",
      category: "work",
      predicateKey: "employment.current",
      operation: "replace",
      sourceType: "chat",
      salience: 4,
    });
    const rows = await empRows(user.id);
    const searching = rows.find((r) => r.predicate_key === "employment.searching");
    expect(searching?.status).toBe("active");
    expect(searching?.valid_to).toBeNull();
  });

  it("C: user-authored current may supersede manual searching", async () => {
    const user = await createTestUser({ name: "Emp C" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу программистом",
      category: "work",
      predicateKey: "employment.searching",
      operation: "replace",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Клиент устроился программистом в банк",
      category: "work",
      predicateKey: "employment.current",
      operation: "replace",
      sourceType: "user",
      sourceCharacter: "user",
      salience: 4,
    });
    const rows = await empRows(user.id);
    expect(rows.find((r) => r.predicate_key === "employment.searching")?.status).toBe(
      "superseded"
    );
    expect(rows.find((r) => r.predicate_key === "employment.current")?.status).toBe("active");
    expect(rows.filter((r) => r.status === "active")).toHaveLength(1);
  });

  it("D: different subject_key rows do not supersede each other", async () => {
    const user = await createTestUser({ name: "Emp D" });
    await upsertFact(user.id, {
      fact: "Клиент ищет работу программистом",
      category: "work",
      predicateKey: "employment.searching",
      subjectKey: "client",
      operation: "replace",
      sourceType: "chat",
      salience: 4,
    });
    await upsertFact(user.id, {
      fact: "Партнёр устроился программистом в банк",
      category: "work",
      predicateKey: "employment.current",
      subjectKey: "partner",
      operation: "replace",
      sourceType: "chat",
      salience: 4,
    });
    const rows = await empRows(user.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "active")).toBe(true);
  });

  it("unavailable embedding still finds a natural work fact", async () => {
    const user = await createTestUser({ name: "Search fallback" });
    await upsertFact(user.id, {
      fact: "Клиент работает программистом и думает сменить работу",
      category: "work",
      sourceType: "chat",
      salience: 3,
    });
    const found = await searchFacts(user.id, "стоит ли мне менять работу?", {
      topK: 3,
      embedTimeoutMs: 0,
    });
    expect(found.some((f) => /работ/i.test(f.fact))).toBe(true);
  });
});
