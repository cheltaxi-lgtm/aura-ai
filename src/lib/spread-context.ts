import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import {
  DEFAULT_DECK_SYSTEM,
  resolveMasterDeckSystem,
  spreadKey,
} from "@/lib/decks";
import { resolveSpreadSymbol } from "@/lib/symbol-visuals";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";

export interface StoredSpreadProfile {
  tarotCards?: SpreadSymbol[];
  deckSystem?: DeckSystem;
  deckSpreads?: Partial<Record<DeckSystem, SpreadSymbol[]>>;
}

/** Spread drawn for a specific deck system (per-master decks in deckSpreads). */
export function getSpreadForSystem(
  profile: StoredSpreadProfile | null | undefined,
  system: DeckSystem
): SpreadSymbol[] {
  const fromSpreads = profile?.deckSpreads?.[system];
  if (fromSpreads && fromSpreads.length >= 3) return fromSpreads;
  if (profile?.deckSystem === system && (profile.tarotCards?.length ?? 0) >= 3) {
    return profile.tarotCards!;
  }
  return [];
}

export interface MasterSpreadContext {
  system: DeckSystem;
  cards: SpreadSymbol[];
  cardsKey: string;
}

/** Cards + deck system for a master — always aligned for display and API. */
export function resolveMasterSpread(
  profile: StoredSpreadProfile | null | undefined,
  masterId: string,
  masters?: ShowcaseMaster[]
): MasterSpreadContext {
  const master = findShowcaseMaster(masterId, masters);
  const system = master?.system ?? resolveMasterDeckSystem(masterId);
  const raw = getSpreadForSystem(profile, system);
  const cards =
    raw.length >= 3
      ? raw.slice(0, 3).map((c) => resolveSpreadSymbol(system, c))
      : [];
  return { system, cards, cardsKey: spreadKey(cards.length >= 3 ? cards : raw) };
}

/** Active triplet / recap spread — prefers profile's current deck, not stale server row. */
export function resolveRecapSpread(
  profile: StoredSpreadProfile | null | undefined,
  fallbackSystem: DeckSystem = DEFAULT_DECK_SYSTEM
): { system: DeckSystem; cards: SpreadSymbol[] } {
  const system = profile?.deckSystem ?? fallbackSystem;
  const raw = getSpreadForSystem(profile, system);
  if (raw.length >= 3) {
    return {
      system,
      cards: raw.slice(0, 3).map((c) => resolveSpreadSymbol(system, c)),
    };
  }
  const legacy = profile?.tarotCards ?? [];
  const legacySystem = profile?.deckSystem ?? fallbackSystem;
  return {
    system: legacySystem,
    cards: legacy.map((c) => resolveSpreadSymbol(legacySystem, c)),
  };
}

export function profilePayloadForMaster(
  profile: StoredSpreadProfile & {
    name: string;
    gender: string;
    zodiac: string;
    birthDate: string;
    birthTime?: string;
    birthCity?: string;
    lifeFocus?: string;
    mainQuestion?: string;
    astroMeta?: unknown;
  },
  masterId: string,
  masters?: ShowcaseMaster[]
) {
  const { system, cards } = resolveMasterSpread(profile, masterId, masters);
  const tarotCards = cards.length >= 3 ? cards : (profile.tarotCards ?? []);
  return {
    userName: profile.name,
    gender: profile.gender === "male" ? "Мужской" : "Женский",
    zodiac: profile.zodiac,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime,
    birthCity: profile.birthCity,
    lifeFocus: profile.lifeFocus,
    mainQuestion: profile.mainQuestion,
    astroMeta: profile.astroMeta,
    tarotCards,
    deckSystem: cards.length >= 3 ? system : profile.deckSystem,
  };
}
