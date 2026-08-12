import { describe, expect, it } from "vitest";
import {
  dailyCardsKey,
  isDailyHistoryMarker,
  normalizeDailyTripletCards,
} from "@/lib/daily-triplet-cards";
import { buildHomeRecapKey, isHomeRecapHidden } from "@/lib/home-recap-key";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { resolveCurrentDailyCards } from "@/lib/current-daily-cards";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { query } from "@/lib/db";
import { createHistoryEntry, recordTripletDrawAnchor } from "@/lib/users";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser, SAMPLE_SYMBOLS } from "./db/fixtures";

describe("daily card symbol helpers", () => {
  it("TEST8: preserves reversed=true", () => {
    const cards = normalizeDailyTripletCards([
      { id: 0, name: "Шут", position: 0, reversed: true },
      { id: 1, name: "Маг", position: 1, reversed: false },
      { id: 2, name: "Жрица", position: 2, reversed: true },
    ]);
    expect(cards?.[0]?.reversed).toBe(true);
    expect(cards?.[2]?.reversed).toBe(true);
  });

  it("daily history marker accepts new and legacy types", () => {
    expect(isDailyHistoryMarker({ type: "daily_triplet", spreadType: "daily" })).toBe(true);
    expect(isDailyHistoryMarker({ type: "triplet" })).toBe(true);
    expect(isDailyHistoryMarker({ type: "guest_resume" })).toBe(false);
  });

  it("TEST14: hide by history id survives source label change", () => {
    const historyId = "11111111-1111-4111-8111-111111111111";
    const hidden = buildHomeRecapKey({ historyId });
    expect(hidden).toBe(`history:${historyId}`);
    expect(isHomeRecapHidden(`history:${historyId}`, hidden)).toBe(true);
    expect(isHomeRecapHidden(`daily:h:${historyId}`, hidden)).toBe(true);
    expect(isHomeRecapHidden(buildHomeRecapKey({ source: "triplet", cardsKey: "abc" }), hidden)).toBe(
      false
    );
  });
});

describe.skipIf(!hasTestDb)("daily artifact identity (db)", () => {
  installDbLifecycle();

  it("TEST1/2: stub user without birth can save daily", async () => {
    const user = await createTestUser();
    // Minimal consumer stub: no birth date (zodiac column is NOT NULL — keep empty).
    await query(`UPDATE users SET birth_date = NULL, zodiac = '' WHERE id = $1`, [user.id]);
    const cards = SAMPLE_SYMBOLS.map((s, position) => ({
      id: s.id,
      name: s.name,
      position,
      reversed: Boolean(s.reversed),
    }));
    const saved = await saveAuthenticatedDailyTriplet({
      userId: user.id,
      cards,
      masterId: "veronika",
      deckSystem: "tarot-veronika",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.daily.cards.map((c) => c.reversed)).toEqual(cards.map((c) => c.reversed));
    expect(saved.daily.deckSystem).toBe("tarot-veronika");
    expect(saved.daily.masterId).toBe("veronika");
  });

  it("TEST4: mismatched session is never attached to history cards", async () => {
    const user = await createTestUser();
    const historyCards = SAMPLE_SYMBOLS.map((s, position) => ({
      id: s.id,
      name: s.name,
      position,
      reversed: Boolean(s.reversed),
    }));
    const history = await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "daily_triplet",
        spreadType: "daily",
        tarotCards: historyCards,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      },
    });
    const { rows: histRows } = await query<{ created_at: Date }>(
      `SELECT created_at FROM history WHERE id = $1`,
      [history.id]
    );
    await recordTripletDrawAnchor(user.id, histRows[0]!.created_at);

    // Session with different cards (Frankenstein bait).
    await query(
      `INSERT INTO sessions (user_id, character_key, spread_type, cards, status, created_at, updated_at)
       VALUES ($1, 'marina', 'daily', $2::jsonb, 'active', NOW(), NOW())`,
      [user.id, JSON.stringify(["Императрица", "Император", "Жрец"])]
    );

    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(true);
    if (!daily.exists) return;
    expect(daily.historyId).toBe(history.id);
    expect(daily.sessionId).toBeNull();
    expect(daily.cardNames).toEqual(historyCards.map((c) => c.name));
    expect(daily.masterId).toBe("veronika");
  });

  it("TEST5: matching session attaches by cardsKey + created_at", async () => {
    const user = await createTestUser();
    const historyCards = SAMPLE_SYMBOLS.map((s, position) => ({
      id: s.id,
      name: s.name,
      position,
      reversed: Boolean(s.reversed),
    }));
    const history = await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "daily_triplet",
        spreadType: "daily",
        tarotCards: historyCards,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      },
    });
    const { rows: histRows } = await query<{ created_at: Date }>(
      `SELECT created_at FROM history WHERE id = $1`,
      [history.id]
    );
    await recordTripletDrawAnchor(user.id, histRows[0]!.created_at);

    const { rows: sessRows } = await query<{ id: string }>(
      `INSERT INTO sessions (user_id, character_key, spread_type, cards, status, created_at, updated_at)
       VALUES ($1, 'veronika', 'daily', $2::jsonb, 'active', $3, NOW() + interval '2 hours')
       RETURNING id`,
      [
        user.id,
        JSON.stringify(historyCards.map((c) => c.name)),
        histRows[0]!.created_at,
      ]
    );

    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(true);
    if (!daily.exists) return;
    expect(daily.sessionId).toBe(sessRows[0]!.id);
    expect(daily.cardsKey).toBe(dailyCardsKey(historyCards));
  });

  it("TEST7: updated_at on old session does not steal current daily", async () => {
    const user = await createTestUser();
    const oldNames = ["Императрица", "Император", "Жрец"];
    const newCards = SAMPLE_SYMBOLS.map((s, position) => ({
      id: s.id,
      name: s.name,
      position,
      reversed: false,
    }));

    await query(
      `INSERT INTO sessions (user_id, character_key, spread_type, cards, status, created_at, updated_at)
       VALUES ($1, 'marina', 'daily', $2::jsonb, 'active', NOW() - interval '2 days', NOW())`,
      [user.id, JSON.stringify(oldNames)]
    );

    const history = await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "daily_triplet",
        spreadType: "daily",
        tarotCards: newCards,
        masterId: "veronika",
        deckSystem: "tarot-veronika",
      },
    });
    const { rows } = await query<{ created_at: Date }>(
      `SELECT created_at FROM history WHERE id = $1`,
      [history.id]
    );
    await recordTripletDrawAnchor(user.id, rows[0]!.created_at);

    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(true);
    if (!daily.exists) return;
    expect(daily.historyId).toBe(history.id);
    expect(daily.cardNames).toEqual(newCards.map((c) => c.name));
    expect(daily.sessionId).toBeNull();
  });

  it("TEST12: guest intro claim is not current daily", async () => {
    const user = await createTestUser();
    const cooldown = await checkTripletCooldown(user.id);
    expect(cooldown.allowed).toBe(true);
    const daily = await resolveCurrentDailyCards(user.id);
    expect(daily.exists).toBe(false);
  });
});
