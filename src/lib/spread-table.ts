import type { SpreadSymbol } from "@/lib/decks/types";
import { createSeededRng } from "@/lib/spread-seed";

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/** Shuffled computed numbers — user picks order of revelation (all tiles are valid). */
export function buildNumerologPickTable(
  computed: SpreadSymbol[],
  seed: string
): SpreadSymbol[] {
  if (computed.length === 0) return [];
  const rng = createSeededRng(`${seed}:num-table`);
  const deck = [...computed];
  shuffleInPlace(deck, rng);
  return deck;
}
