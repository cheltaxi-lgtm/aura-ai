import { describe, expect, it } from "vitest";
import { mergeProfileWithServer } from "@/lib/onboarding-flow-helpers";
import { buildHomeRecapKey } from "@/lib/home-recap-key";
import { tarotCardsKey } from "@/lib/tarot";
import type { StoredProfile } from "@/types/stored-profile";

const cards = [
  { id: 0, name: "Шут", position: 0, reversed: false },
  { id: 1, name: "Маг", position: 1, reversed: true },
  { id: 2, name: "Жрица", position: 2, reversed: false },
];

function profile(partial: Partial<StoredProfile> = {}): StoredProfile {
  return {
    name: "Тест",
    gender: "female",
    birthDate: "1990-01-15",
    zodiac: "Козерог",
    tarotCards: cards,
    ...partial,
  };
}

describe("mergeProfileWithServer home dismissal", () => {
  it("does not resurrect hidden local spread when server has none", () => {
    const cardsKey = tarotCardsKey(cards.map((c) => ({ name: c.name })));
    const hidden = buildHomeRecapKey({ source: "guest_intro", cardsKey });
    const prev = profile();
    const restored = profile({ tarotCards: [] });
    const next = mergeProfileWithServer(restored, prev, false, {
      homeRecapHiddenKey: hidden,
      prevRecapKey: buildHomeRecapKey({ source: "unknown", cardsKey }),
    });
    expect(next.tarotCards ?? []).toEqual([]);
  });

  it("strips server spread when it matches dismissed intro cardsKey", () => {
    const cardsKey = tarotCardsKey(cards.map((c) => ({ name: c.name })));
    const hidden = buildHomeRecapKey({ source: "guest_intro", cardsKey });
    const restored = profile();
    const next = mergeProfileWithServer(restored, null, false, {
      homeRecapHiddenKey: hidden,
    });
    expect(next.tarotCards ?? []).toEqual([]);
    expect(next.teaser).toBeUndefined();
  });

  it("keeps a different server spread after an intro was hidden", () => {
    const introCards = cards;
    const dailyCards = [
      { id: 3, name: "Императрица", position: 0, reversed: false },
      { id: 4, name: "Император", position: 1, reversed: false },
      { id: 5, name: "Жрец", position: 2, reversed: true },
    ];
    const introKey = tarotCardsKey(introCards.map((c) => ({ name: c.name })));
    const hidden = buildHomeRecapKey({ source: "guest_intro", cardsKey: introKey });
    const restored = profile({ tarotCards: dailyCards });
    const next = mergeProfileWithServer(restored, profile({ tarotCards: introCards }), false, {
      homeRecapHiddenKey: hidden,
      prevRecapKey: buildHomeRecapKey({ source: "guest_intro", cardsKey: introKey }),
    });
    expect(next.tarotCards?.map((c) => c.name)).toEqual(dailyCards.map((c) => c.name));
  });
});
