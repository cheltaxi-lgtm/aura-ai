import { describe, expect, it, vi } from "vitest";
const gate = vi.hoisted(() => ({ afterSource: null as null | (() => Promise<void>) }));
vi.mock("@/lib/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, queryClient: async (...args: Parameters<typeof actual.queryClient>) => {
    const result = await actual.queryClient(...args);
    if (String(args[1]).startsWith("SELECT id FROM hd_charts") && gate.afterSource) await gate.afterSource();
    return result;
  } };
});
import { query } from "@/lib/db";
import { upsertFact } from "@/lib/memory/user-facts";
import { forgetHdChartFact } from "@/lib/human-design/memory";
import { recordInitialMemoryChoice } from "@/lib/memory/preferences";
import { createTestUser } from "./db/fixtures";
import { hasTestDb, installDbLifecycle } from "./db/setup";

describe.skipIf(!hasTestDb)("HD memory source erasure race", () => {
  installDbLifecycle();
  it("chart deletion waits for the fact writer, then removes its committed fact", async () => {
    const user = await createTestUser();
    await recordInitialMemoryChoice(user.id, "enabled");
    const { rows: [chart] } = await query(`INSERT INTO hd_charts
      (user_id,birth_date,timezone,place_name,lat,lon,fingerprint,chart,engine_version)
      VALUES ($1,'1990-01-01','UTC','Test',0,0,'memory-race','{}','test') RETURNING id`, [user.id]);
    let ready!: () => void;
    let resume!: () => void;
    const sourceChecked = new Promise<void>(resolve => { ready = resolve; });
    const paused = new Promise<void>(resolve => { resume = resolve; });
    gate.afterSource = async () => { ready(); await paused; };
    const write = upsertFact(user.id, { fact: "Клиент — генератор с сакральным авторитетом", sourceType: "human_design", sourceEntityId: chart.id });
    try {
      await sourceChecked;
      let erased = false;
      const deletion = query("DELETE FROM hd_charts WHERE id=$1 AND user_id=$2", [chart.id, user.id])
        .then(async () => { erased = true; await forgetHdChartFact(user.id, chart.id); });
      await new Promise(resolve => setTimeout(resolve, 100));
      const waited = !erased;
      resume();
      await Promise.all([write, deletion]);
      expect(waited).toBe(true);
      expect((await query("SELECT id FROM user_facts WHERE user_id=$1", [user.id])).rows).toEqual([]);
    } finally { gate.afterSource = null; resume(); }
  });
});
