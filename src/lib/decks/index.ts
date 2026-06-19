import { FULL_DECK, TRIPLET_POSITIONS as TAROT_POSITIONS } from "@/lib/tarot";
import { RUNE_SYMBOLS } from "./runes";
import { SLAVIC_SYMBOLS } from "./slavic";
import { ASTROLOGY_SYMBOLS } from "./astrology";
import type { DeckDefinition, DeckSystem, SpreadSymbol } from "./types";

export type { DeckSystem, SpreadSymbol, DeckDefinition };

export const RUNE_POSITIONS = ["Корень", "Клинок", "Горизонт"] as const;
export const SLAVIC_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;
export const ASTRO_POSITIONS = ["Карма", "Настоящее", "Путь"] as const;

const STYLE_BASE: Record<DeckSystem, string> = {
  runes:
    "ancient Norse rune carved into dark weathered stone, glowing molten gold engraving, cold iron texture, harsh dramatic lighting, centered, vertical card, ornate steel-gold border",
  "tarot-veronika":
    "Rider-Waite style tarot card, soft warm golden light, gentle mystical watercolor, elegant gold border, vertical card",
  "tarot-marina":
    "tarot card, moonlit deep-blue and gold, ethereal celestial mood, refined elegant gold filigree border, vertical card",
  slavic:
    "old Slavic sacred symbol Reza Roda, carved wooden old-russian style, deep red and gold ornament border, ancient mystical, centered, vertical card",
  astrology:
    "Vedic Jyotish celestial symbol, deep indigo cosmic starfield, glowing gold celestial line-art, sacred geometry, vertical card",
};

export const DECK_REGISTRY: Record<DeckSystem, DeckDefinition> = {
  runes: {
    system: "runes",
    symbols: RUNE_SYMBOLS,
    positions: RUNE_POSITIONS,
    styleBase: STYLE_BASE.runes,
  },
  "tarot-veronika": {
    system: "tarot-veronika",
    symbols: FULL_DECK.map((c) => ({ ...c, slug: undefined, kind: "tarot" as const })),
    positions: TAROT_POSITIONS,
    styleBase: STYLE_BASE["tarot-veronika"],
  },
  "tarot-marina": {
    system: "tarot-marina",
    symbols: FULL_DECK.map((c) => ({ ...c, slug: undefined, kind: "tarot" as const })),
    positions: TAROT_POSITIONS,
    styleBase: STYLE_BASE["tarot-marina"],
  },
  slavic: {
    system: "slavic",
    symbols: SLAVIC_SYMBOLS,
    positions: SLAVIC_POSITIONS,
    styleBase: STYLE_BASE.slavic,
  },
  astrology: {
    system: "astrology",
    symbols: ASTROLOGY_SYMBOLS,
    positions: ASTRO_POSITIONS,
    styleBase: STYLE_BASE.astrology,
  },
};

/** Master id / slug → deck system */
export const MASTER_DECK_SYSTEM: Record<string, DeckSystem> = {
  ragnar: "runes",
  veronika: "tarot-veronika",
  gadalka_marina: "tarot-marina",
  agafya: "slavic",
  "shri-raj": "astrology",
};

export const DEFAULT_DECK_SYSTEM: DeckSystem = "tarot-veronika";

export function resolveMasterDeckSystem(masterId?: string | null): DeckSystem {
  if (!masterId) return DEFAULT_DECK_SYSTEM;
  return MASTER_DECK_SYSTEM[masterId] ?? DEFAULT_DECK_SYSTEM;
}

export function getDeckDefinition(system: DeckSystem): DeckDefinition {
  return DECK_REGISTRY[system];
}

export function getDeckPositions(system: DeckSystem): readonly string[] {
  return DECK_REGISTRY[system].positions;
}

export function drawSpread(system: DeckSystem, count = 3): SpreadSymbol[] {
  const deck = [...DECK_REGISTRY[system].symbols];
  const drawn: SpreadSymbol[] = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    const idx = Math.floor(Math.random() * deck.length);
    drawn.push(deck.splice(idx, 1)[0]);
  }
  return drawn;
}

export function findSymbolByName(system: DeckSystem, name: string): SpreadSymbol | undefined {
  const trimmed = name.trim();
  const relaxed = trimmed.replace(/ё/g, "е");
  return DECK_REGISTRY[system].symbols.find(
    (s) => s.name === trimmed || s.name.replace(/ё/g, "е") === relaxed
  );
}

export function spreadKey(cards: { name: string }[] | undefined): string {
  return (cards ?? []).map((c) => c.name).join("|");
}

/** @deprecated use spreadKey — kept for backward compat */
export { spreadKey as tarotCardsKey };
