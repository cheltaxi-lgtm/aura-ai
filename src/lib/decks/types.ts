export type DeckSystem =
  | "runes"
  | "tarot-veronika"
  | "tarot-marina"
  | "slavic"
  | "astrology"
  | "numerology";

export interface SpreadSymbol {
  id: number;
  name: string;
  meaning: string;
  slug?: string;
  arcana?: "major" | "minor";
  suit?: "cups" | "wands" | "swords" | "pentacles";
  kind?: "rune" | "tarot" | "slavic" | "planet" | "zodiac" | "numerology";
}

export interface DeckDefinition {
  system: DeckSystem;
  symbols: SpreadSymbol[];
  positions: readonly string[];
  styleBase: string;
}
