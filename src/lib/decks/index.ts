import { FULL_DECK, TRIPLET_POSITIONS as TAROT_POSITIONS } from "@/lib/tarot";
import { parseCardOrientation } from "@/lib/card-orientation";
import { RUNE_SYMBOLS } from "./runes";
import { SLAVIC_SYMBOLS } from "./slavic";
import { ASTROLOGY_SYMBOLS } from "./astrology";
import { NUMEROLOGY_SYMBOLS, NUMEROLOGY_POSITIONS } from "./numerology";
import { LENORMAND_SYMBOLS, LENORMAND_POSITIONS } from "./lenormand";
import { normalizeSpreadId } from "@/lib/spreads/registry";
import type { SpreadId } from "@/lib/spreads/types";
import type { DeckDefinition, DeckSystem, SpreadSymbol } from "./types";

export type { DeckSystem, SpreadSymbol, DeckDefinition };

export const RUNE_POSITIONS = ["Корень", "Клинок", "Горизонт"] as const;
export const SLAVIC_POSITIONS = ["Прошлое", "Настоящее", "Будущее"] as const;
export const ASTRO_POSITIONS = ["Карма", "Настоящее", "Путь"] as const;
export const NUMEROLOGY_SPREAD_POSITIONS = NUMEROLOGY_POSITIONS;

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
  numerology:
    "sacred numerology oracle card, golden sacred geometry, glowing number symbol, deep indigo violet gradient, golden ratio spiral, soft mystical light, vertical card",
  lenormand:
    "Petit Lenormand oracle card, vintage European illustration, soft cream and muted teal, elegant thin border, clear symbolic vignette, vertical card",
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
  numerology: {
    system: "numerology",
    symbols: NUMEROLOGY_SYMBOLS,
    positions: NUMEROLOGY_POSITIONS,
    styleBase: STYLE_BASE.numerology,
  },
  lenormand: {
    system: "lenormand",
    symbols: LENORMAND_SYMBOLS.map((c) => ({ ...c, kind: "lenormand" as const })),
    positions: LENORMAND_POSITIONS,
    styleBase: STYLE_BASE.lenormand,
  },
};

/** Master id / slug → deck system */
export const MASTER_DECK_SYSTEM: Record<string, DeckSystem> = {
  ragnar: "runes",
  veronika: "tarot-veronika",
  gadalka_marina: "tarot-marina",
  agafya: "slavic",
  "shri-raj": "astrology",
  numerolog: "numerology",
};

export const DEFAULT_DECK_SYSTEM: DeckSystem = "tarot-veronika";

export function resolveMasterDeckSystem(masterId?: string | null): DeckSystem {
  if (!masterId) return DEFAULT_DECK_SYSTEM;
  return MASTER_DECK_SYSTEM[masterId] ?? DEFAULT_DECK_SYSTEM;
}

/** Deck for a spread session — Lenormand line uses the Lenormand oracle, not tarot. */
export function resolveSpreadDeckSystem(
  spreadId: SpreadId | string | null | undefined,
  masterId?: string | null
): DeckSystem {
  if (normalizeSpreadId(spreadId) === "lenormand-line") return "lenormand";
  return resolveMasterDeckSystem(masterId);
}

export function getDeckDefinition(system: DeckSystem): DeckDefinition {
  return DECK_REGISTRY[system];
}

export function getDeckPositions(system: DeckSystem): readonly string[] {
  return DECK_REGISTRY[system].positions;
}

export function drawSpread(
  system: DeckSystem,
  count = 3,
  rng: () => number = Math.random
): SpreadSymbol[] {
  const deck = [...DECK_REGISTRY[system].symbols];
  const drawn: SpreadSymbol[] = [];
  for (let i = 0; i < count && deck.length > 0; i++) {
    const idx = Math.floor(rng() * deck.length);
    drawn.push(deck.splice(idx, 1)[0]);
  }
  return drawn;
}

export function findSymbolByName(system: DeckSystem, name: string): SpreadSymbol | undefined {
  const trimmed = parseCardOrientation(name).name.trim();
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
