import type { DeckSystem } from "@/lib/decks/types";
import { getDeckImagePath, DECK_BACK_PATHS } from "@/data/decks";
import { getSymbolDescription } from "@/data/descriptions";
import {
  getDeckDefinition,
  resolveMasterDeckSystem,
  DEFAULT_DECK_SYSTEM,
  findSymbolByName,
} from "@/lib/decks";
import { inferDeckSystemFromCardNames } from "@/lib/spread-context";
import type { SpreadSymbol } from "@/lib/decks/types";
import { formatReversedCardName, parseCardOrientation } from "@/lib/card-orientation";

export interface ResolvedDeckCard {
  system: DeckSystem;
  name: string;
  imagePath: string;
  shortMeaning: string;
  fullMeaning: string;
  keywords: string[];
  symbol: SpreadSymbol;
  reversed: boolean;
  detectedOnly: boolean;
  originalName?: string;
}

export interface DeckCardInput {
  id?: number;
  name: string;
  meaning?: string;
  reversed?: boolean;
  imagePath?: string;
  placeholder?: boolean;
  originalName?: string;
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
  card: DeckCardInput
): ResolvedDeckCard {
  const parsed = parseCardOrientation(card.name);
  const baseName = parsed.name;
  const reversed = card.reversed ?? parsed.reversed;
  const lookupCard = { ...card, name: baseName };

  let effectiveSystem = system;
  let symbol = findSymbolByName(system, baseName);

  if (!symbol) {
    effectiveSystem = inferDeckSystemFromCardNames([lookupCard], system);
    symbol = findSymbolByName(effectiveSystem, baseName);
  }

  if (!symbol) {
    const def = getDeckDefinition(system);
    if (typeof card.id === "number") {
      symbol = def.symbols.find((s) => s.id === card.id);
    }
  }

  const resolvedSymbol =
    symbol ??
    ({
      id: card.id ?? -1,
      name: baseName,
      meaning: card.meaning ?? "",
    } as SpreadSymbol);

  const desc = getSymbolDescription(effectiveSystem, resolvedSymbol.name);
  const deckImagePath = getDeckImagePath(effectiveSystem, resolvedSymbol.name);
  const usePreresolvedArt =
    Boolean(card.imagePath) && !card.placeholder && card.imagePath !== DECK_BACK_PATHS[effectiveSystem];
  const detectedOnly = !symbol && !usePreresolvedArt;

  return {
    system: effectiveSystem,
    name: formatReversedCardName(resolvedSymbol.name, reversed),
    imagePath: usePreresolvedArt ? card.imagePath! : deckImagePath,
    shortMeaning: desc.shortMeaning || resolvedSymbol.meaning,
    fullMeaning: desc.fullMeaning,
    keywords: desc.keywords,
    symbol: resolvedSymbol,
    reversed,
    detectedOnly,
    originalName: card.originalName,
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
  numerology: "lux-deck-card--numerology",
  lenormand: "lux-deck-card--lenormand",
};

export const DECK_SYSTEM_LABEL: Record<DeckSystem, string> = {
  runes: "рун",
  "tarot-veronika": "таро",
  "tarot-marina": "таро",
  slavic: "символов",
  astrology: "грах и знаков",
  numerology: "чисел",
  lenormand: "карт Ленорман",
};
