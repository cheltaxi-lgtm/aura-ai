import { describe, expect, it } from "vitest";
import { saveIntroTriplet, resolveIntroFreeReading } from "@/lib/intro-triplet";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { hasTestDb, installDbLifecycle } from "./db/setup";
import { createTestUser } from "./db/fixtures";
import { deleteHistoryEntry, updateUserProfile } from "@/lib/users";
import { profileHasGuestIntroLifetimeFlag, profileHasIntroReadingConsumed, recordIntroReadingConsumed } from "@/lib/rate-limit-anchors";
import { withTransaction } from "@/lib/db";

const cards = [
  { id: 0, name: "Шут", position: 0, reversed: false },
  { id: 1, name: "Маг", position: 1, reversed: false },
  { id: 2, name: "Жрица", position: 2, reversed: false },
];

describe.skipIf(!hasTestDb)("registered introductory spread", () => {
  installDbLifecycle();

  it("is one-time, verifies owned cards, and leaves the daily entitlement intact", async () => {
    const user = await createTestUser();
    const first = await saveIntroTriplet({
      userId: user.id, cards, masterId: "veronika", deckSystem: "tarot-veronika",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.message);
    const retry = await saveIntroTriplet({
      userId: user.id, cards, masterId: "veronika", deckSystem: "tarot-veronika",
    });
    expect(retry).toMatchObject({ ok: true, reused: true });
    const changed = await saveIntroTriplet({
      userId: user.id,
      cards: [{ id: 3, name: "Императрица", position: 0, reversed: false }, cards[1], cards[2]],
      masterId: "veronika", deckSystem: "tarot-veronika",
    });
    expect(changed).toMatchObject({ ok: false, code: "ALREADY_USED" });

    const free = await resolveIntroFreeReading({
      userId: user.id, characterId: "veronika", spreadType: "intro",
      intention: "", customQuestion: "", tarotCards: cards,
    });
    expect(free?.cards.map(card => card.name)).toEqual(cards.map(card => card.name));
    expect(await resolveIntroFreeReading({
      userId: user.id, characterId: "veronika", spreadType: "intro",
      intention: "", customQuestion: "", tarotCards: [cards[1], cards[0], cards[2]],
    })).toBeNull();
    await withTransaction((client) => recordIntroReadingConsumed(user.id, client));
    await updateUserProfile(user.id, {
      name: "Profile updated after intro", gender: "female", birthDate: "1990-01-15",
      birthCity: "Екатеринбург", zodiac: "Козерог",
    });
    expect(await profileHasGuestIntroLifetimeFlag(user.id)).toBe(true);
    expect(await profileHasIntroReadingConsumed(user.id)).toBe(true);
    expect((await checkTripletCooldown(user.id)).allowed).toBe(true);
    await deleteHistoryEntry(user.id, first.intro.historyId);
    expect(await saveIntroTriplet({
      userId: user.id, cards, masterId: "veronika", deckSystem: "tarot-veronika",
    })).toMatchObject({ ok: false, code: "ALREADY_USED" });
    const daily = await saveAuthenticatedDailyTriplet({
      userId: user.id, cards, masterId: "veronika", deckSystem: "tarot-veronika",
    });
    expect(daily.ok).toBe(true);
  });
});
