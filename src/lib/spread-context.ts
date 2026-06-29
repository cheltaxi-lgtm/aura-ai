import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import {
  DEFAULT_DECK_SYSTEM,
  DECK_REGISTRY,
  resolveMasterDeckSystem,
  spreadKey,
  findSymbolByName,
} from "@/lib/decks";
import { resolveSpreadSymbol } from "@/lib/symbol-visuals";
import { findShowcaseMaster, type ShowcaseMaster } from "@/lib/showcase-masters";
import { MAX_SPREAD_CARD_COUNT } from "@/lib/spreads/registry";

const ALL_DECK_SYSTEMS = Object.keys(DECK_REGISTRY) as DeckSystem[];

function capSpreadSymbols(cards: SpreadSymbol[]): SpreadSymbol[] {
  return cards.slice(0, MAX_SPREAD_CARD_COUNT);
}

/** Pick deck system that best matches card names (fixes runes+tarot mismatches). */
export function inferDeckSystemFromCardNames(
  cards: { name: string }[],
  fallback: DeckSystem = DEFAULT_DECK_SYSTEM
): DeckSystem {
  if (!cards.length) return fallback;

  let bestSystem = fallback;
  let bestScore = -1;
  for (const system of ALL_DECK_SYSTEMS) {
    const score = cards.filter((c) => findSymbolByName(system, c.name)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSystem = system;
    }
  }
  return bestScore > 0 ? bestSystem : fallback;
}

export function reconcileSpreadDeck(
  system: DeckSystem,
  cards: { name: string; meaning?: string; id?: number }[]
): { system: DeckSystem; cards: SpreadSymbol[] } {
  const allMatch = cards.length > 0 && cards.every((c) => findSymbolByName(system, c.name));
  const effectiveSystem = allMatch ? system : inferDeckSystemFromCardNames(cards, system);

  return {
    system: effectiveSystem,
    cards: cards.map((c) => resolveSpreadSymbol(effectiveSystem, c)),
  };
}

export interface SpreadReadingRow {
  characterName: string;
  createdAt?: string;
  contextData?: {
    type?: string;
    tarotCards?: { name: string }[];
    deckSystem?: DeckSystem;
  };
}

export interface StoredSpreadProfile {
  tarotCards?: SpreadSymbol[];
  deckSystem?: DeckSystem;
  deckSpreads?: Partial<Record<DeckSystem, SpreadSymbol[]>>;
  /** Master who drew / owns the current daily triplet. */
  tripletMasterId?: string;
}

/** Spread drawn for a specific deck system (per-master decks in deckSpreads). */
export function getSpreadForSystem(
  profile: StoredSpreadProfile | null | undefined,
  system: DeckSystem
): SpreadSymbol[] {
  const fromSpreads = profile?.deckSpreads?.[system];
  if (fromSpreads && fromSpreads.length >= 1) return capSpreadSymbols(fromSpreads);
  if (profile?.deckSystem === system && (profile.tarotCards?.length ?? 0) >= 1) {
    return capSpreadSymbols(profile.tarotCards!);
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
  if (raw.length >= 1) {
    const aligned = reconcileSpreadDeck(system, raw);
    return { system: aligned.system, cards: aligned.cards, cardsKey: spreadKey(aligned.cards) };
  }
  return { system, cards: [], cardsKey: spreadKey(raw) };
}

/** True when user history still contains a saved daily triplet draw. */
export function hasServerTripletSpread(readings: SpreadReadingRow[]): boolean {
  return readings.some(
    (r) =>
      r.characterName === "triplet" &&
      (r.contextData?.tarotCards?.length ?? 0) >= 3
  );
}

/** Daily triplet spread only — photo readings stay in master chat, not on главной. */
export function resolveTripletDisplaySpread(
  readings: SpreadReadingRow[],
  profile: StoredSpreadProfile | null | undefined,
  fallbackSystem: DeckSystem = DEFAULT_DECK_SYSTEM
): { system: DeckSystem; cards: SpreadSymbol[] } {
  let bestTriplet: { at: string; system: DeckSystem; raw: { name: string }[] } | null = null;

  for (const row of readings) {
    if (row.characterName !== "triplet") continue;
    const ctx = row.contextData;
    const raw = ctx?.tarotCards;
    if (!raw || raw.length < 3) continue;
    const system =
      (ctx.deckSystem as DeckSystem | undefined) ??
      profile?.deckSystem ??
      fallbackSystem;
    const at = row.createdAt ?? "";
    if (!bestTriplet || at > bestTriplet.at) {
      bestTriplet = { at, system, raw: raw.slice(0, 3) };
    }
  }

  if (bestTriplet) {
    return reconcileSpreadDeck(bestTriplet.system, bestTriplet.raw);
  }

  return resolveRecapSpread(profile, fallbackSystem);
}

/** @deprecated alias — main page recap uses daily triplet only */
export function resolveLatestDisplaySpread(
  readings: SpreadReadingRow[],
  profile: StoredSpreadProfile | null | undefined,
  fallbackSystem: DeckSystem = DEFAULT_DECK_SYSTEM
): { system: DeckSystem; cards: SpreadSymbol[] } {
  return resolveTripletDisplaySpread(readings, profile, fallbackSystem);
}

/** Active triplet / recap spread — prefers profile's current deck, not stale server row. */
export function resolveRecapSpread(
  profile: StoredSpreadProfile | null | undefined,
  fallbackSystem: DeckSystem = DEFAULT_DECK_SYSTEM
): { system: DeckSystem; cards: SpreadSymbol[] } {
  const system = profile?.deckSystem ?? fallbackSystem;
  const raw = getSpreadForSystem(profile, system);
  if (raw.length >= 1) {
    return reconcileSpreadDeck(system, raw);
  }
  const legacy = profile?.tarotCards ?? [];
  const legacySystem = profile?.deckSystem ?? fallbackSystem;
  return reconcileSpreadDeck(legacySystem, legacy);
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
  const tarotCards = cards.length >= 1 ? cards : (profile.tarotCards ?? []);
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
    deckSystem: cards.length >= 1 ? system : profile.deckSystem,
  };
}

const SPREAD_READING_TYPES = new Set(["reading", "intention_spread"]);

export function spreadReadingCardsKey(
  contextData?: { tarotCards?: { name: string }[] } | null
): string {
  return spreadKey(contextData?.tarotCards ?? []);
}

/** Saved full reading (triplet or intention) for this master + spread. */
export function masterHasReadingForSpread(
  readings: SpreadReadingRow[],
  masterId: string,
  cardsKey: string
): boolean {
  if (!cardsKey) return false;
  return readings.some((row) => {
    if (row.characterName !== masterId) return false;
    const type = row.contextData?.type;
    if (!type || !SPREAD_READING_TYPES.has(type)) return false;
    return spreadReadingCardsKey(row.contextData) === cardsKey;
  });
}

/** Master bound to the latest daily triplet draw. */
export function resolveTripletOwnerMasterId(
  profile: Pick<StoredSpreadProfile, "tripletMasterId"> | null | undefined,
  readings: SpreadReadingRow[],
  fallbacks: { tripletMasterId?: string | null } = {}
): string | null {
  let latest: { at: string; masterId: string } | null = null;
  for (const row of readings) {
    if (row.characterName !== "triplet") continue;
    const ctx = row.contextData as { masterId?: string } | undefined;
    const masterId = ctx?.masterId;
    if (!masterId) continue;
    const at = row.createdAt ?? "";
    if (!latest || at > latest.at) latest = { at, masterId };
  }
  if (latest?.masterId) return latest.masterId;

  if (profile?.tripletMasterId) return profile.tripletMasterId;
  if (fallbacks.tripletMasterId) return fallbacks.tripletMasterId;
  return null;
}

/** Any master (optionally excluding one) already has a reading for this triplet spread. */
export function anyMasterReadingForSpread(
  readings: SpreadReadingRow[],
  cardsKey: string,
  excludeMasterId?: string
): boolean {
  if (!cardsKey) return false;
  return readings.some((row) => {
    if (excludeMasterId && row.characterName === excludeMasterId) return false;
    if (row.characterName === "triplet") return false;
    const type = row.contextData?.type;
    if (!type || !SPREAD_READING_TYPES.has(type)) return false;
    return spreadReadingCardsKey(row.contextData) === cardsKey;
  });
}

export function findSavedSpreadReading(
  readings: SpreadReadingRow[],
  masterId: string,
  cardsKey: string
): SpreadReadingRow | undefined {
  if (!cardsKey) return undefined;
  return readings.find((row) => {
    if (row.characterName !== masterId) return false;
    const type = row.contextData?.type;
    if (!type || !SPREAD_READING_TYPES.has(type)) return false;
    if (spreadReadingCardsKey(row.contextData) !== cardsKey) return false;
    const text =
      type === "intention_spread"
        ? (row.contextData as { reading?: string }).reading
        : (row.contextData as { reading?: string }).reading;
    return typeof text === "string" && text.trim().length > 0;
  });
}
