import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";
import { query } from "@/lib/db";
import { createHistoryEntry } from "@/lib/users";
import { recordDailyReadingAnchor } from "@/lib/rate-limit-anchors";
import { spendRunesAmount } from "@/lib/rune-service";
import { resolveDailyMasterKey } from "@/lib/daily-master-policy";
import { DailyReadingGenerationError, getExistingDailyReading, getOrCreateDailyReading } from "@/lib/daily-energy";

const ai = vi.hoisted(() => ({ fail: false, calls: 0 }));
vi.mock("@/lib/validated-ai-generation", () => ({
  generateValidatedAiText: async (params: { inputParts: unknown[] }) => {
    ai.calls++;
    if (ai.fail) return { ok: false };
    const names = params.inputParts[3] as string[];
    return { ok: true, content: names.map(name => `Карта ${name} помогает выбрать главное дело на сегодня и спокойно завершить его.`).join("\n\n") };
  },
}));
vi.mock("@/lib/prose-completion", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/prose-completion")>(),
  completeProseWithContinuation: async () => null,
}));
vi.mock("@/lib/memory/build-memory-context", () => ({
  buildMemoryContext: async () => ({}),
  appendMemoryContextToPrompt: (system: string) => system,
}));

const date = "2026-10-01";
const oldText = "Число шесть помогает прислушаться к себе и выбрать подходящий ритм дня. Сегодня завершите одно важное дело.";
const numbers = ["6", "9", "33"].map((name, i) => ({ name, meaning: "Число", reversed: false, position: ["Утро", "День", "Вечер"][i] }));

describe("daily master policy", () => {
  it("falls back to Tarot for Matrix, missing, unknown and prototype keys", () => {
    for (const id of ["numerolog", undefined, null, "unknown", "toString", "__proto__"]) {
      expect(resolveDailyMasterKey(id)).toBe("veronika");
    }
  });
  it("preserves explicitly supported daily masters", () => {
    for (const id of ["veronika", "ragnar", "agafya", "shri-raj"]) expect(resolveDailyMasterKey(id)).toBe(id);
  });
});

async function seedNumeric(spreadId: "triplet" | "daily-extended" = "triplet") {
  const user = await createTestUser({ runeBalance: 100 });
  if (spreadId === "daily-extended") await spendRunesAmount(user.id, 15, "daily extended fixture");
  await recordDailyReadingAnchor(user.id, date, spreadId);
  const daily = (await query<{ id: string }>(`INSERT INTO daily_readings
    (user_id,character_key,deck_system,reading_text,cards,reading_date,spread_id)
    VALUES ($1,'numerolog','numerology',$2,$3::jsonb,$4::date,$5) RETURNING id`,
  [user.id, oldText, JSON.stringify(numbers), date, spreadId])).rows[0];
  for (let i = 0; i < 2; i++) await createHistoryEntry({ userId: user.id, characterName: "daily_energy", isPaid: spreadId === "daily-extended",
    contextData: { readingDate: date, reading: oldText, characterKey: "numerolog", deckSystem: "numerology", tarotCards: numbers, spreadId, keep: i } });
  const job = (await query<{ id: string }>(`INSERT INTO async_jobs(user_id,kind,status,input,result,dedupe_key,billing_state)
    VALUES ($1,$2,'completed',$3::jsonb,$4::jsonb,$5,'completed') RETURNING id`, [user.id,
    spreadId === "triplet" ? "daily_reading" : "daily_extended", JSON.stringify({ localDate: date, characterKey: "numerolog" }),
    JSON.stringify({ localDate: date, text: oldText, cards: numbers, system: "numerology", spreadId }), randomUUID()])).rows[0];
  return { user, daily, job };
}
async function copies(userId: string) {
  return {
    daily: (await query("SELECT * FROM daily_readings WHERE user_id=$1", [userId])).rows,
    history: (await query("SELECT * FROM history WHERE user_id=$1 ORDER BY id", [userId])).rows,
    jobs: (await query("SELECT * FROM async_jobs WHERE user_id=$1 ORDER BY id", [userId])).rows,
  };
}
async function entitlement(userId: string) {
  return {
    ledger: (await query("SELECT * FROM rune_transactions WHERE user_id=$1 ORDER BY id", [userId])).rows,
    profile: (await query("SELECT astro_meta FROM users WHERE id=$1", [userId])).rows,
  };
}

describe.skipIf(!hasTestDb)("numeric daily artifact recovery (db)", () => {
  installDbLifecycle();
  beforeEach(() => { ai.fail = false; ai.calls = 0; });
  for (const spreadId of ["triplet", "daily-extended"] as const) {
    it(`repairs ${spreadId} in place across daily/history/jobs without consuming entitlement`, async () => {
      const seeded = await seedNumeric(spreadId);
      const foreign = await seedNumeric();
      const foreignBefore = await copies(foreign.user.id);
      const before = await copies(seeded.user.id);
      const billing = await entitlement(seeded.user.id);
      const result = await getExistingDailyReading(seeded.user.id, date);
      expect(result).toMatchObject({ system: "tarot-veronika", cached: true, spreadId });
      expect(result!.cards).toHaveLength(spreadId === "triplet" ? 3 : 7);
      for (const card of result!.cards) {
        expect(card.name).not.toMatch(/^\d+$/);
        expect(result!.text).toContain(card.name);
      }
      const after = await copies(seeded.user.id);
      expect(after.daily[0].id).toBe(seeded.daily.id);
      expect(after.daily[0].character_key).toBe("veronika");
      expect(after.daily[0].reading_date).toEqual(before.daily[0].reading_date);
      expect(after.history.map(row => row.id)).toEqual(before.history.map(row => row.id));
      after.history.forEach((row, i) => {
        expect(row.is_paid).toBe(before.history[i].is_paid);
        expect(row.context_data).toMatchObject({ reading: result!.text, deckSystem: "tarot-veronika", tarotCards: result!.cards, keep: before.history[i].context_data.keep });
      });
      expect(after.jobs[0].id).toBe(seeded.job.id);
      expect(after.jobs[0].input).toEqual(before.jobs[0].input);
      expect(after.jobs[0].billing_state).toBe(before.jobs[0].billing_state);
      expect(after.jobs[0].result).toMatchObject({ text: result!.text, cards: result!.cards, system: "tarot-veronika", spreadId });
      expect(await entitlement(seeded.user.id)).toEqual(billing);
      expect(await copies(foreign.user.id)).toEqual(foreignBefore);
      const count = ai.calls;
      expect(await getExistingDailyReading(seeded.user.id, date)).toEqual(result);
      expect(ai.calls).toBe(count);
    });
  }
  it("retains all copies and billing on failed AI generation, then retries without charging", async () => {
    const seeded = await seedNumeric("daily-extended");
    const before = await copies(seeded.user.id);
    const billing = await entitlement(seeded.user.id);
    ai.fail = true;
    await expect(getExistingDailyReading(seeded.user.id, date)).rejects.toBeInstanceOf(DailyReadingGenerationError);
    expect(await copies(seeded.user.id)).toEqual(before);
    expect(await entitlement(seeded.user.id)).toEqual(billing);
    ai.fail = false;
    expect(await getExistingDailyReading(seeded.user.id, date)).toMatchObject({ system: "tarot-veronika", spreadId: "daily-extended" });
    expect(await entitlement(seeded.user.id)).toEqual(billing);
  });
  it("parallel repairs converge on one persisted artifact and preserve history identities", async () => {
    const seeded = await seedNumeric();
    const results = await Promise.all([getExistingDailyReading(seeded.user.id, date), getExistingDailyReading(seeded.user.id, date)]);
    expect(results[0]).toEqual(results[1]);
    expect((await copies(seeded.user.id)).history).toHaveLength(2);
  });
  it("normalizes a direct Matrix-master request before drawing the new deck", async () => {
    const user = await createTestUser();
    const result = await getOrCreateDailyReading({ userId: user.id, characterKey: "numerolog", name: user.name,
      zodiac: user.zodiac, birthDate: user.birth_date ?? "", localDate: date });
    expect(result).toMatchObject({ system: "tarot-veronika", spreadId: "triplet", cached: false });
    expect((await copies(user.id)).daily[0].character_key).toBe("veronika");
  });
});
