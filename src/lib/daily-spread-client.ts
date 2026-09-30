import { TRIPLET_COOLDOWN_MS } from "@/lib/triplet-limit";
import type { CurrentDailyCardsResult } from "@/lib/current-daily-cards";
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
  cardNames: string[];
}): "daily" | "new" {
  const daily = input.daily;
  if (!daily?.exists) return "new";
  const age = Date.now() - new Date(daily.createdAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age >= TRIPLET_COOLDOWN_MS) return "new";
  return daily?.exists && daily.historyId && daily.masterId === input.masterId &&
    input.cardNames.length === 3 && daily.cardNames.length === 3 &&
    input.cardNames.every((name, i) => name === daily.cardNames[i])
    ? "daily"
    : "new";
}
