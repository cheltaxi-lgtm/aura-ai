import { tarotCardsKey } from "@/lib/tarot";
import { hasCompleteSpread, normalizeSpreadId, requiredCardCount } from "./registry";

/** Stable cache/history key for N-card spreads (falls back to triplet slice). */
export function spreadCardsKey(
  cards: string[] | undefined,
  spreadId?: string | null,
  spreadType: "daily" | "new" | "photo" = "new"
): string | undefined {
  if (!cards?.length) return undefined;
  const id = normalizeSpreadId(spreadId);
  const required = requiredCardCount(id, spreadType);
  const slice = cards.slice(0, required).map((name) => ({ name: String(name) }));
  if (hasCompleteSpread(slice.map((c) => c.name), id, spreadType)) {
    return tarotCardsKey(slice) || undefined;
  }
  if (cards.length >= 3) {
    return tarotCardsKey(cards.slice(0, 3).map((name) => ({ name: String(name) }))) || undefined;
  }
  if (cards.length >= 1) {
    return tarotCardsKey(cards.map((name) => ({ name: String(name) }))) || undefined;
  }
  return undefined;
}

export function spreadCardNamesForScene(
  cards: { name: string }[] | undefined,
  spreadId?: string | null,
  spreadType: "daily" | "new" = "new"
): string[] | undefined {
  if (!cards?.length) return undefined;
  const id = normalizeSpreadId(spreadId);
  const required = requiredCardCount(id, spreadType);
  const names = cards.slice(0, required).map((c) => c.name);
  if (hasCompleteSpread(names, id, spreadType)) return names;
  if (cards.length >= 3) return cards.slice(0, 3).map((c) => c.name);
  return names.length ? names : undefined;
}
