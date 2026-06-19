import type { DeckSystem } from "@/lib/decks/types";
import { getDeckImagePath, DECK_BACK_PATHS } from "@/data/decks";
import { getSymbolDescription } from "@/data/descriptions";
import { getDeckDefinition, resolveMasterDeckSystem, DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { findSymbolByName } from "@/lib/decks";
import type { SpreadSymbol } from "@/lib/decks/types";

export interface ResolvedDeckCard {
  system: DeckSystem;
  name: string;
  imagePath: string;
  shortMeaning: string;
  fullMeaning: string;
  keywords: string[];
  symbol: SpreadSymbol;
}

export function resolveDeckSystem(
  system?: DeckSystem,
  masterId?: string
): DeckSystem {
  if (system) return system;
  if (masterId) return resolveMasterDeckSystem(masterId);
  return DEFAULT_DECK_SYSTEM;
}

export function resolveDeckCard(
  system: DeckSystem,
  card: { id?: number; name: string; meaning?: string }
): ResolvedDeckCard {
  const symbol =
    findSymbolByName(system, card.name) ??
    ({
      id: card.id ?? -1,
      name: card.name,
      meaning: card.meaning ?? "",
    } as SpreadSymbol);

  const desc = getSymbolDescription(system, symbol.name);

  return {
    system,
    name: symbol.name,
    imagePath: getDeckImagePath(system, symbol.name),
    shortMeaning: desc.shortMeaning || symbol.meaning,
    fullMeaning: desc.fullMeaning,
    keywords: desc.keywords,
    symbol,
  };
}

export function listDeckCards(system: DeckSystem): ResolvedDeckCard[] {
  return getDeckDefinition(system).symbols.map((s) => resolveDeckCard(system, s));
}

export function deckBackPath(system: DeckSystem): string {
  return DECK_BACK_PATHS[system];
}

export const DECK_ACCENT_CLASS: Record<DeckSystem, string> = {
  runes: "lux-deck-card--runes",
  "tarot-veronika": "lux-deck-card--tarot-veronika",
  "tarot-marina": "lux-deck-card--tarot-marina",
  slavic: "lux-deck-card--slavic",
  astrology: "lux-deck-card--astrology",
};

export const DECK_SYSTEM_LABEL: Record<DeckSystem, string> = {
  runes: "рун",
  "tarot-veronika": "таро",
  "tarot-marina": "таро",
  slavic: "символов",
  astrology: "грах и знаков",
};
