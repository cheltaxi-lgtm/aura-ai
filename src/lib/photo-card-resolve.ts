import type { DeckSystem } from "@/lib/decks/types";
import { findSymbolByName } from "@/lib/decks";
import {
  expandPhotoCardCandidates,
  normalizePhotoCardName,
} from "@/lib/photo-card-aliases";
import { getDeckImagePath, DECK_BACK_PATHS } from "@/data/decks";

const TAROT_SYSTEMS: DeckSystem[] = ["tarot-veronika", "tarot-marina"];

function isTarotLikeDeck(deckType?: string): boolean {
  const t = (deckType ?? "").toLowerCase();
  return /таро|tarot|rider|waite|мarseille|марсель|thoth|тота|oracle|оракул|lenormand|ленорман|колода|deck|arcana|аркана|golden thread|labyrinthos|shadow work|wild unknown|deviant|классическ/i.test(
    t
  );
}

function isBackPath(system: DeckSystem, path: string): boolean {
  return path === DECK_BACK_PATHS[system];
}

function artForName(system: DeckSystem, name: string): { imagePath: string; matched: boolean } {
  const imagePath = getDeckImagePath(system, name);
  const matched = Boolean(findSymbolByName(system, name)) && !isBackPath(system, imagePath);
  return { imagePath, matched };
}

export interface AuraArtMatch {
  displayName: string;
  originalName: string;
  imagePath: string;
  artSystem: DeckSystem;
  placeholder: boolean;
}

/** @deprecated use normalizePhotoCardName */
export function normalizeTarotName(raw: string): string | undefined {
  return normalizePhotoCardName(raw);
}

/** @deprecated use expandPhotoCardCandidates */
export function tarotNameCandidates(raw: string): string[] {
  return expandPhotoCardCandidates(raw);
}

/** Map any detected card label to best Zovus art + display name. */
export function resolveAuraArtForDetected(
  rawName: string,
  options: {
    primarySystem: DeckSystem;
    deckType?: string;
    preferSystems?: DeckSystem[];
  }
): AuraArtMatch {
  const originalName = rawName.replace(/[«»"']/g, "").trim();
  const systemsToTry = [
    ...new Set([
      ...(options.preferSystems ?? []),
      options.primarySystem,
      ...(isTarotLikeDeck(options.deckType) ? TAROT_SYSTEMS : []),
      "runes" as DeckSystem,
      "slavic" as DeckSystem,
      "astrology" as DeckSystem,
    ]),
  ];

  const normalized = normalizePhotoCardName(originalName);
  const candidateNames = [
    ...new Set([
      ...expandPhotoCardCandidates(originalName),
      ...(normalized ? [normalized] : []),
    ]),
  ];

  for (const system of systemsToTry) {
    for (const candidate of candidateNames) {
      const sym = findSymbolByName(system, candidate);
      const name = sym?.name ?? candidate;
      const { imagePath, matched } = artForName(system, name);
      if (matched) {
        return {
          displayName: name,
          originalName,
          imagePath,
          artSystem: system,
          placeholder: false,
        };
      }
    }
  }

  const displayName = normalized ?? originalName;
  const fallbackPath = getDeckImagePath(options.primarySystem, displayName);
  const hasFallbackArt =
    Boolean(findSymbolByName(options.primarySystem, displayName)) &&
    !isBackPath(options.primarySystem, fallbackPath);

  return {
    displayName,
    originalName,
    imagePath: hasFallbackArt ? fallbackPath : "",
    artSystem: options.primarySystem,
    placeholder: !hasFallbackArt,
  };
}

export function resolveDetectedSymbolName(system: DeckSystem, rawName: string): string {
  return resolveAuraArtForDetected(rawName, { primarySystem: system }).displayName;
}
