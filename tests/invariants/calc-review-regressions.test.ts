import { describe, expect, it } from "vitest";
import { getZodiacFromDate, normalizeBirthDate } from "@/utils/zodiac";
import { buildAstroMeta } from "@/lib/astro-profile";
import { profileAstroToPayload } from "@/components/ProfileAstroFields";
import { dailySessionCardNames, restoredTripletSpreadType } from "@/lib/daily-spread-client";
import { parseSessionDailyCardNames } from "@/lib/daily-triplet-cards";
import { buildSessionSpreadCards } from "@/lib/intention-draw";
import { reconcileSpreadDeck } from "@/lib/spread-context";
import { spreadIdentityKey } from "@/lib/spread-identity";
import { readingPayloadForMaster, resolveTarotCardsForOutgoingChat } from "@/lib/chat-reading-helpers";
import type { CurrentDailyCardsResult } from "@/lib/current-daily-cards";

const cards = [
  { id: 0, name: "Шут", position: 0, reversed: true },
  { id: 1, name: "Маг", position: 1, reversed: false },
  { id: 2, name: "Жрица", position: 2, reversed: true },
];
const daily: Extract<CurrentDailyCardsResult, { exists: true }> = {
  exists: true, historyId: "history", sessionId: null, masterId: "veronika", deckSystem: "tarot-veronika",
  cards, cardNames: cards.map(c => c.name), cardsKey: spreadIdentityKey("tarot-veronika", cards),
  createdAt: new Date().toISOString(), recapKey: "history:history",
};

describe("daily restore preserves the complete artifact", () => {
  it("round-trips history objects through session strings and display symbols", () => {
    const names = dailySessionCardNames(cards);
    expect(names).toEqual(["Шут (перев.)", "Маг", "Жрица (перев.)"]);
    expect(parseSessionDailyCardNames(cards)).toEqual(names);
    expect(parseSessionDailyCardNames({ tarotCards: cards })).toEqual(names);
    const restored = buildSessionSpreadCards("veronika", names);
    expect(restored.spreadCards.map(c => c.reversed)).toEqual([true, false, true]);
    expect(reconcileSpreadDeck("tarot-veronika", cards).cards.map(c => c.reversed)).toEqual([true, false, true]);
    expect(restoredTripletSpreadType({ daily, masterId: "veronika", deckSystem: restored.system, cards: restored.spreadCards })).toBe("daily");
    expect(dailySessionCardNames(restored.spreadCards)).toEqual(names);
    const profile = { name: "Тест", gender: "female" as const, birthDate: "", zodiac: "", deckSystem: restored.system, tarotCards: restored.spreadCards };
    const payload = readingPayloadForMaster(profile, "veronika", restored.spreadCards, undefined, "triplet", "daily");
    expect(payload.tarotCards.map(c => [c.id, c.reversed])).toEqual([[0, true], [1, false], [2, true]]);
    const outgoing = resolveTarotCardsForOutgoingChat({ characterId: "veronika", activeProfile: profile,
      sessionSpreadMeta: { spreadType: "daily", cardNames: names } });
    expect(outgoing?.map(c => [c.id, c.reversed])).toEqual([[0, true], [1, false], [2, true]]);
  });
  it("rejects same-name cards with different deck, ids, order, orientation or master", () => {
    const valid = { daily, masterId: "veronika", deckSystem: "tarot-veronika" as const, cards };
    expect(restoredTripletSpreadType(valid)).toBe("daily");
    expect(restoredTripletSpreadType({ ...valid, deckSystem: "tarot-marina" })).toBe("new");
    expect(restoredTripletSpreadType({ ...valid, masterId: "ragnar" })).toBe("new");
    for (const changed of [cards.slice().reverse(), cards.map(c => ({ ...c, reversed: false })),
      cards.map((c, i) => i ? c : { ...c, id: 77 })]) {
      expect(restoredTripletSpreadType({ ...valid, cards: changed })).toBe("new");
    }
    expect(restoredTripletSpreadType({ ...valid, daily: { ...daily, createdAt: new Date(Date.now() - 86_400_000).toISOString() } })).toBe("new");
  });
});

describe("civil birth dates have one zodiac and registration meaning", () => {
  it.each([
    ["1990-05-04", "04.05.1990", "04/05/1990", "Телец", "earth"],
    ["1990-03-25", "25.03.1990", "25/03/1990", "Овен", "fire"],
    ["2000-02-29", "29.02.2000", "29/02/2000", "Рыбы", "water"],
  ])("normalizes equivalent formats of %s", (iso, dotted, slash, name, element) => {
    for (const date of [iso, dotted, slash]) {
      expect(normalizeBirthDate(date)).toBe(iso);
      expect(getZodiacFromDate(date)).toMatchObject({ name, element });
      expect(buildAstroMeta(date)).toEqual(buildAstroMeta(iso));
      const profile = profileAstroToPayload("Тест", {
        gender: "female", birthDate: date, birthTime: "", birthTimeUnknown: true,
        birthCity: "", lifeFocus: "general", mainQuestion: "",
      });
      expect(profile).toMatchObject({ birthDate: iso, astroMeta: { element } });
    }
  });
  it.each(["1990-02-30", "30.02.1990", "31/04/1990", "2001-02-29", "not-a-date", "", "1990-05-04T00:00:00Z"])("does not normalize or guess %s", date => {
    expect(normalizeBirthDate(date)).toBeNull();
    expect(getZodiacFromDate(date)).toBeNull();
    expect(buildAstroMeta(date)).toBeNull();
  });
  it("valid Date objects retain UTC civil semantics, invalid Date has no sign", () => {
    expect(getZodiacFromDate(new Date("1990-05-04T00:00:00Z"))?.name).toBe("Телец");
    expect(getZodiacFromDate(new Date(NaN))).toBeNull();
  });
});
