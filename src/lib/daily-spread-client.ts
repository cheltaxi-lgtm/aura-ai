import { spreadKey } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";
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

  const cardsKey = spreadKey(input.cards);
  const profileKey =
    input.profile?.tarotCards && input.profile.tarotCards.length >= 3
      ? spreadKey(input.profile.tarotCards)
      : "";
  if (cardsKey && profileKey && cardsKey === profileKey) return "daily";

  return undefined;
}

export function isDailySpreadReading(spreadType?: string | null): boolean {
  return spreadType === "daily";
}
