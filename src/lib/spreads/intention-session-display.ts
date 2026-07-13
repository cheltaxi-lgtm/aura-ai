import type { DeckSystem } from "@/lib/decks/types";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { SpreadId } from "./types";
import { getSpread, normalizeSpreadId } from "./registry";

export type IntentionChatSpreadDisplay = {
  source: "intention";
  cards: SpreadSymbol[];
  system: DeckSystem;
  spreadId: SpreadId;
};

/** Cards must match the spread layout for the current session meta. */
export function spreadCardsMatchSpreadId(
  cards: { name: string }[] | null | undefined,
  spreadId: SpreadId | string | null | undefined
): boolean {
  if (!cards?.length) return false;
  const id = normalizeSpreadId(typeof spreadId === "string" ? spreadId : undefined);
  return cards.length === getSpread(id).cardCount;
}

export function buildIntentionChatSpreadDisplay(options: {
  cards: SpreadSymbol[];
  system: DeckSystem;
  spreadId: SpreadId | string;
}): IntentionChatSpreadDisplay | null {
  const spreadId = normalizeSpreadId(
    typeof options.spreadId === "string" ? options.spreadId : undefined
  );
  const required = getSpread(spreadId).cardCount;
  if (options.cards.length < required) return null;
  return {
    source: "intention",
    cards: options.cards.slice(0, required),
    system: options.system,
    spreadId,
  };
}
