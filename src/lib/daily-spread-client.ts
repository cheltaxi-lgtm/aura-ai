import { TRIPLET_COOLDOWN_MS } from "@/lib/triplet-limit";
import type { CurrentDailyCardsResult } from "@/lib/current-daily-cards";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckSystem } from "@/lib/decks/types";
import { spreadIdentityKey } from "@/lib/spread-identity";
import { formatReversedCardName } from "@/lib/card-orientation";
import type { StoredProfile } from "@/types/stored-profile";

export function inferDailySpreadType(input: {
  explicitSpreadType?: string | null;
  sessionSpreadType?: string | null;
  sessionIntention?: string | null;
  cards: SpreadSymbol[];
  profile?: StoredProfile | null;
}): "daily" | "new" | undefined {
  if (input.explicitSpreadType === "daily" || input.sessionSpreadType === "daily") {
    return "daily";
  }
  if (input.explicitSpreadType === "new" || input.sessionSpreadType === "new") {
    return "new";
  }
  if (input.sessionIntention?.trim()) return "new";

  // Profile card equality is not evidence of a saved daily artifact.
  return undefined;
}

export function isDailySpreadReading(spreadType?: string | null): boolean {
  return spreadType === "daily";
}

/** Restore a daily hint only for the server artifact and its chosen master. */
export function restoredTripletSpreadType(input: {
  daily: CurrentDailyCardsResult | null;
  masterId: string;
  deckSystem: DeckSystem;
  cards: readonly Pick<SpreadSymbol, "id" | "reversed">[];
}): "daily" | "new" {
  const daily = input.daily;
  if (!daily?.exists) return "new";
  const age = Date.now() - new Date(daily.createdAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age >= TRIPLET_COOLDOWN_MS) return "new";
  return daily.historyId && daily.masterId === input.masterId &&
    input.deckSystem === daily.deckSystem && input.cards.length === 3 &&
    spreadIdentityKey(input.deckSystem, input.cards.map(card => ({ id: card.id, reversed: card.reversed === true }))) ===
      spreadIdentityKey(daily.deckSystem, daily.cards)
    ? "daily"
    : "new";
}

/** sessions.cards is a legacy string array; preserve orientation in its supported notation. */
export function dailySessionCardNames(cards: readonly Pick<SpreadSymbol, "name" | "reversed">[]): string[] {
  return cards.map(card => formatReversedCardName(card.name, card.reversed === true));
}
