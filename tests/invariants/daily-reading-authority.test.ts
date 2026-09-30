import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { inferDailySpreadType, restoredTripletSpreadType } from "@/lib/daily-spread-client";
import { resolveDailyFreeReading } from "@/lib/daily-spread-billing";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { createHistoryEntry } from "@/lib/users";
import { resolveCurrentDailyCards } from "@/lib/current-daily-cards";
import { query } from "@/lib/db";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, SAMPLE_SYMBOLS } from "./db/fixtures";

describe("daily reading request boundary", () => {
  it("does not infer daily from ordinary profile cards or a different master", () => {
    const cards = SAMPLE_SYMBOLS.map(card => ({ ...card, meaning: "" }));
    expect(inferDailySpreadType({ cards, profile: { name: "Fixture", gender: "female", birthDate: "", zodiac: "", tarotCards: cards } })).toBeUndefined();
    expect(restoredTripletSpreadType({ daily: { exists: false }, masterId: "veronika", cardNames: cards.map(c => c.name) })).toBe("new");
  });
  it("validates before async enqueue, prompting or billing and does not continue on save network failure", () => {
    const route = readFileSync("src/app/api/reading/route.ts", "utf8");
    const rejection = route.indexOf('code: "DAILY_READING_UNAVAILABLE"');
    expect(rejection).toBeGreaterThan(0);
    expect(rejection).toBeLessThan(route.indexOf("return enqueuePaidAsyncJob"));
    expect(rejection).toBeLessThan(route.indexOf("let systemPrompt ="));
    expect(rejection).toBeLessThan(route.indexOf("await BillingService"));
    const flow = readFileSync("src/hooks/useOnboardingFlow.ts", "utf8");
    expect(flow.slice(flow.indexOf("if (!serverOk)"), flow.indexOf("await proceedToMasterAfterTriplet(updated, true)")))
      .toMatch(/setStep\("triplet"\);\s*return;/);
  });
});

describe.skipIf(!hasTestDb)("daily reading authority in isolated PostgreSQL", () => {
  installDbLifecycle();
  async function fixture() {
    const user = await createTestUser({ runeBalance: 40 });
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id, cards: SAMPLE_SYMBOLS, masterId: "veronika", deckSystem: "tarot-veronika",
    });
    if (!saved.ok) throw Error(saved.code);
    const request = { profileUserId: user.id, characterId: "veronika", spreadType: "daily", tarotCards: SAMPLE_SYMBOLS };
    return { user, saved, request };
  }
  it("accepts an owned current artifact and rebuilds orientation and meaning for older clients", async () => {
    const { request, saved } = await fixture();
    expect(restoredTripletSpreadType({ daily: saved.daily, masterId: "veronika", cardNames: saved.daily.cardNames })).toBe("daily");
    expect(restoredTripletSpreadType({ daily: saved.daily, masterId: "ragnar", cardNames: saved.daily.cardNames })).toBe("new");
    expect(restoredTripletSpreadType({ daily: { ...saved.daily, createdAt: new Date(Date.now() - 86400000).toISOString() }, masterId: "veronika", cardNames: saved.daily.cardNames })).toBe("new");
    const result = await resolveDailyFreeReading({ ...request, tarotCards: SAMPLE_SYMBOLS.map(({ name }) => ({ name })) });
    expect(result?.cards[1]).toMatchObject({ id: 1, name: "Маг", reversed: true });
    expect(result?.cards.every(card => card.meaning.length > 0)).toBe(true);
    expect(result?.cards[1].meaning).toContain("Перевёрнутая");
    expect(await resolveDailyFreeReading({ ...request, tarotCards: SAMPLE_SYMBOLS.map(card => ({ name: card.reversed ? `${card.name} (перевёрнутая)` : card.name })) })).not.toBeNull();
  });
  it("does not grant free access from client daily hints, ordinary history or another owner's artifact", async () => {
    const { request } = await fixture();
    const other = await createTestUser();
    const foreign = { ...request, profileUserId: other.id };
    expect(await resolveDailyFreeReading(foreign)).toBeNull();
    await createHistoryEntry({ userId: other.id, characterName: "triplet", contextData: { type: "triplet", spreadType: "daily", tarotCards: SAMPLE_SYMBOLS } });
    expect(await resolveDailyFreeReading(foreign)).toBeNull();
    const { rows } = await query("SELECT rune_balance FROM users WHERE id=$1", [other.id]);
    expect(rows[0].rune_balance).toBe(0);
  });
  it("rejects unrelated questions and masters, including an unknown master that defaults to Tarot", async () => {
    const { request } = await fixture();
    for (const override of [{ intention: "custom" }, { customQuestion: "Произвольный вопрос" }, { characterId: "ragnar" }, { characterId: "unknown" }, { characterId: "gadalka_marina" }, { spreadType: "new" }]) {
      expect(await resolveDailyFreeReading({ ...request, ...override })).toBeNull();
    }
  });
  it("rejects different card order, id, orientation and invented names", async () => {
    const { request } = await fixture();
    for (const tarotCards of [
      [...SAMPLE_SYMBOLS].reverse(),
      SAMPLE_SYMBOLS.map((card, i) => i === 1 ? { ...card, reversed: false } : card),
      SAMPLE_SYMBOLS.map((card, i) => i === 0 ? { ...card, id: 77 } : card),
      SAMPLE_SYMBOLS.map((card, i) => i === 0 ? { ...card, name: "Несуществующая карта" } : card),
      SAMPLE_SYMBOLS.slice(0, 2),
    ]) expect(await resolveDailyFreeReading({ ...request, tarotCards })).toBeNull();
  });
  it("session metadata cannot establish or change the master of a daily artifact", async () => {
    const { user, request } = await fixture();
    await query("INSERT INTO sessions(user_id,character_key,spread_type,cards,status) VALUES($1,'ragnar','daily',$2::jsonb,'active')", [user.id, JSON.stringify(SAMPLE_SYMBOLS.map(c=>c.name))]);
    expect(await resolveCurrentDailyCards(user.id)).toMatchObject({ exists:true, masterId:"veronika", sessionId:null });
    await query("DELETE FROM history WHERE user_id=$1", [user.id]);
    expect(await resolveCurrentDailyCards(user.id)).toEqual({ exists:false });
    expect(await resolveDailyFreeReading(request)).toBeNull();
  });
  it("rejects expired and future-dated artifacts without debiting the gift", async () => {
    const { user, saved, request } = await fixture();
    for (const interval of ["-24 hours", "1 hour"]) {
      await query("UPDATE history SET created_at=NOW()+$2::interval WHERE id=$1", [saved.daily.historyId, interval]);
      expect(await resolveDailyFreeReading(request)).toBeNull();
      expect(await resolveCurrentDailyCards(user.id)).toEqual({ exists: false });
    }
    const { rows } = await query("SELECT rune_balance FROM users WHERE id=$1", [user.id]);
    expect(rows[0].rune_balance).toBe(40);
  });
});
