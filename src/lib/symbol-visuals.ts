import {
  findSymbolByName,
  getDeckDefinition,
} from "@/lib/decks";
import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import { tarotCardRoman } from "@/lib/tarot-visuals";

import { parseCardOrientation } from "@/lib/card-orientation";

export function resolveSpreadSymbol(
  system: DeckSystem,
  card: { id?: number; name: string; meaning?: string }
): SpreadSymbol {
  const baseName = parseCardOrientation(card.name).name;
  const byName = findSymbolByName(system, baseName);
  if (byName) return byName;

  const def = getDeckDefinition(system);
  if (typeof card.id === "number") {
    const byId = def.symbols.find((s) => s.id === card.id);
    if (byId) return byId;
  }

  return {
    id: card.id ?? -1,
    name: baseName,
    meaning: card.meaning ?? "",
  };
}

export function symbolCornerLabel(system: DeckSystem, symbol: SpreadSymbol): string {
  if (system === "numerology") return symbol.name;
  if (system === "runes") return "᛭";
  if (system === "slavic") return "☉";
  if (system === "astrology") {
    return symbol.kind === "planet" ? "☊" : "♈";
  }
  if (symbol.arcana === "major" && symbol.id >= 0 && symbol.id <= 21) {
    return tarotCardRoman(symbol.id);
  }
  if (symbol.arcana === "minor") {
    const suitShort: Record<string, string> = {
      cups: "♢",
      wands: "♣",
      swords: "♠",
      pentacles: "♦",
    };
    return suitShort[symbol.suit ?? ""] ?? "—";
  }
  return "✦";
}

export function symbolKindLabel(system: DeckSystem, symbol: SpreadSymbol): string {
  switch (system) {
    case "runes":
      return "Rune";
    case "slavic":
      return "Reza";
    case "astrology":
      return symbol.kind === "planet" ? "Graha" : "Rashi";
    case "numerology":
      return "Num";
    case "tarot-marina":
    case "tarot-veronika":
      return symbol.arcana === "major" ? "Major" : "Minor";
    default:
      return "Symbol";
  }
}
