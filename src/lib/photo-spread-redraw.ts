import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import {
  findSymbolByName,
  getDeckPositions,
  resolveMasterDeckSystem,
} from "@/lib/decks";
import { getDeckImagePath, DECK_BACK_PATHS } from "@/data/decks";
import { getSymbolDescription } from "@/data/descriptions";
import { resolveAuraArtForDetected } from "@/lib/photo-card-resolve";
import { formatReversedCardName, parseCardOrientation } from "@/lib/card-orientation";
import {
  MAX_PHOTO_CARD_NAME_LENGTH,
  MAX_PHOTO_CARDS,
  MAX_PHOTO_POSITION_LENGTH,
  type PhotoRecognitionConfidence,
} from "@/lib/photo-reading-constants";

export { parseCardOrientation, formatReversedCardName } from "@/lib/card-orientation";

export interface RedrawSpreadCard {
  name: string;
  /** Label as read from the photo (may differ from Aura display name) */
  originalName: string;
  reversed: boolean;
  position: string;
  imagePath: string;
  shortMeaning: string;
  placeholder: boolean;
  order: number;
  /** Model's confidence in THIS specific card; "high" once the user manually confirms/edits it. */
  confidence?: PhotoRecognitionConfidence;
}

export interface RedrawSpread {
  system: DeckSystem;
  deckType?: string;
  spreadType?: string;
  cards: RedrawSpreadCard[];
}

/** Minimum symbols required before photo interpretation. */
export const PHOTO_MIN_CARD_COUNT = 1;

/** LLM / parser failure labels — not real deck symbols. */
const UNRECOGNIZED_CARD_RE = /^(не удалось|не распозн|не определ|не видно|нет карт)/i;

export function isUnrecognizedCardLabel(label: string | undefined | null): boolean {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return true;
  return UNRECOGNIZED_CARD_RE.test(trimmed);
}

export function filterRecognizedCardLabels(cards: string[]): string[] {
  return cards.filter((c) => !isUnrecognizedCardLabel(c));
}

/** @deprecated use card count from recognition; kept for legacy imports */
export const PHOTO_SPREAD_CARD_COUNT = PHOTO_MIN_CARD_COUNT;

export function resolvePhotoDeckSystem(
  deckType: string | undefined,
  masterId: string
): DeckSystem {
  const masterSystem = resolveMasterDeckSystem(masterId);
  const text = (deckType ?? "").toLowerCase();

  if (/рун|futhark| elder|runes/i.test(text)) return "runes";
  if (/слав|ved|reza|род|slavic/i.test(text)) return "slavic";
  if (/астр|джйотиш|jyotish|знак|planet|vedic/i.test(text)) return "astrology";
  if (/таро|tarot|rider|lenorman|оракул|oracle|мarseille|марсель/i.test(text)) {
    if (masterId === "gadalka_marina") return "tarot-marina";
    if (masterSystem === "tarot-marina" || masterSystem === "tarot-veronika") {
      return masterSystem;
    }
    return "tarot-veronika";
  }

  return masterSystem;
}

export function inferSpreadPositions(
  count: number,
  system: DeckSystem,
  spreadType?: string
): string[] {
  const defaults = [...getDeckPositions(system)];
  if (count <= defaults.length) {
    return defaults.slice(0, count);
  }

  const numbered = Array.from({ length: count }, (_, i) => `Позиция ${i + 1}`);
  const spread = (spreadType ?? "").toLowerCase();

  if (/прошл|настоя|будущ/i.test(spread) && count >= 3) {
    return ["Прошлое", "Настоящее", "Будущее", ...numbered.slice(3)].slice(0, count);
  }

  return numbered;
}

export function createEmptyManualRedrawSpread(masterId: string): RedrawSpread {
  const system = resolveMasterDeckSystem(masterId);
  return {
    system,
    deckType: "Ручной ввод",
    spreadType: "Ручной расклад",
    cards: [],
  };
}

export function buildPartialRedrawSpread(
  masterId: string,
  detectedCards: string[],
  deckType?: string,
  spreadType?: string
): RedrawSpread {
  if (!detectedCards.length) {
    return createEmptyManualRedrawSpread(masterId);
  }
  const system = resolvePhotoDeckSystem(deckType, masterId);
  return normalizeRedrawSpreadForMaster(
    mapDetectedToRedrawSpread({
      detectedCards,
      system,
      deckType,
      spreadType,
    }),
    masterId
  );
}

function clampSpreadCardInput<T extends { name: string; position?: string }>(
  cards: T[]
): T[] {
  return cards.slice(0, MAX_PHOTO_CARDS).map((card) => ({
    ...card,
    name: card.name.trim().slice(0, MAX_PHOTO_CARD_NAME_LENGTH),
    position: card.position?.trim().slice(0, MAX_PHOTO_POSITION_LENGTH),
  }));
}

export function normalizeRedrawSpreadForMaster(
  spread: RedrawSpread,
  masterId: string
): RedrawSpread {
  const system = resolveMasterDeckSystem(masterId);
  const count = Math.max(spread.cards.length, spread.cards.filter((c) => c.name?.trim()).length);
  const cardCount = count > 0 ? count : spread.cards.length;
  const positions = inferSpreadPositions(cardCount, system, spread.spreadType);
  const detected = spread.cards.map((c) => (c.reversed ? `${c.name} (перев.)` : c.name));
  const confidences = spread.cards.map((c) => c.confidence ?? "unknown");

  const remapped = mapDetectedToRedrawSpread({
    detectedCards: detected,
    system,
    deckType: spread.deckType,
    spreadType: spread.spreadType ?? `${cardCount} ${cardCount === 1 ? "символ" : cardCount < 5 ? "символа" : "символов"}`,
    positions: positions.slice(0, detected.length),
    confidences,
  });

  return {
    ...remapped,
    cards: remapped.cards.map((c, i) => ({
      ...c,
      order: i,
      position: positions[i] ?? c.position,
    })),
  };
}

export function isPhotoSpreadComplete(spread: RedrawSpread | null | undefined): boolean {
  const count =
    spread?.cards.filter(
      (c) =>
        c.name?.trim() &&
        !isUnrecognizedCardLabel(c.name) &&
        !isUnrecognizedCardLabel(c.originalName)
    ).length ?? 0;
  return count >= PHOTO_MIN_CARD_COUNT;
}

/** Drop failure placeholders; return empty manual spread when nothing real was detected. */
export function sanitizeRecognizedRedrawSpread(
  spread: RedrawSpread | null | undefined,
  masterId: string
): { spread: RedrawSpread; manual: boolean } {
  const cards =
    spread?.cards.filter(
      (c) => !isUnrecognizedCardLabel(c.name) && !isUnrecognizedCardLabel(c.originalName)
    ) ?? [];

  if (!cards.length) {
    return { spread: createEmptyManualRedrawSpread(masterId), manual: true };
  }

  return {
    spread: {
      ...(spread as RedrawSpread),
      cards: cards.map((c, i) => ({ ...c, order: i })),
    },
    manual: false,
  };
}

export function redrawSpreadToSpreadSymbols(spread: RedrawSpread): SpreadSymbol[] {
  return spread.cards.map((card, index) => {
    const baseName = card.name.replace(/\s*\(перев\.?\)\s*$/i, "").trim();
    const symbol = findSymbolByName(spread.system, baseName);
    const desc = getSymbolDescription(spread.system, symbol?.name ?? baseName);
    return {
      id: symbol?.id ?? index + 1,
      name: card.reversed ? `${symbol?.name ?? baseName} (перев.)` : (symbol?.name ?? baseName),
      meaning: desc.shortMeaning || symbol?.meaning || card.shortMeaning || "",
    };
  });
}

export function mapDetectedToRedrawSpread(params: {
  detectedCards: string[];
  system: DeckSystem;
  deckType?: string;
  spreadType?: string;
  positions?: string[];
  /** Per-card confidence, index-aligned with detectedCards. Missing entries default to "unknown". */
  confidences?: PhotoRecognitionConfidence[];
}): RedrawSpread {
  const { detectedCards, system, deckType, spreadType } = params;
  const positions =
    params.positions ??
    inferSpreadPositions(detectedCards.length, system, spreadType);

  const cards: RedrawSpreadCard[] = detectedCards.map((raw, index) => {
    const { name: rawName, reversed } = parseCardOrientation(raw);
    const art = resolveAuraArtForDetected(rawName, {
      primarySystem: system,
      deckType,
    });
    const symbol = findSymbolByName(art.artSystem, art.displayName);
    const desc = getSymbolDescription(art.artSystem, symbol?.name ?? art.displayName);
    const imagePath = getDeckImagePath(system, art.displayName);
    const placeholder =
      imagePath === DECK_BACK_PATHS[system] &&
      !findSymbolByName(system, art.displayName);

    return {
      name: art.displayName,
      originalName: art.originalName,
      reversed,
      position: positions[index] ?? `Позиция ${index + 1}`,
      imagePath,
      shortMeaning: desc.shortMeaning || symbol?.meaning || "",
      placeholder,
      order: index,
      confidence: params.confidences?.[index] ?? "unknown",
    };
  });

  return { system, deckType, spreadType, cards };
}

export function redrawSpreadToTarotCards(spread: RedrawSpread) {
  return spread.cards.map((c) => ({
    name: c.reversed ? `${c.name} (перев.)` : c.name,
    originalName: c.originalName,
    meaning: c.shortMeaning,
    reversed: c.reversed,
    position: c.position,
    imagePath: c.imagePath,
    placeholder: c.placeholder,
  }));
}

/** Deck row / chat / ritual — preserves Zovus art paths from photo redraw. */
export function redrawSpreadToDeckCards(spread: RedrawSpread) {
  return redrawSpreadToTarotCards(spread);
}

export function isRecognizedSpread(params: {
  detectedCards: string[];
  deckType?: string;
  spreadType?: string;
}): { ok: boolean; reason?: string } {
  const { detectedCards } = params;

  const validCards = filterRecognizedCardLabels(detectedCards);
  if (!validCards.length) {
    if (!detectedCards.length) {
      return { ok: false, reason: "На фото не удалось распознать карты или символы расклада." };
    }
    return { ok: false, reason: "Это не похоже на расклад — загрузите фото карт или рун в кадре." };
  }

  return { ok: true };
}

export function buildSpreadSummaryForLlm(spread: RedrawSpread): string {
  const lines = spread.cards.map((c, i) => {
    const label =
      c.originalName !== c.name
        ? `«${c.originalName}» (на фото) → Zovus: «${c.name}»`
        : `«${c.name}»`;
    return `${i + 1}. ${c.position}: ${label}${c.reversed ? " (перевёрнутая)" : ""}${
      c.placeholder ? " [нет арта Zovus — трактуй по названию с фото]" : ""
    }`;
  });
  return [
    `Система Zovus: ${spread.system}`,
    spread.deckType ? `Колода на фото: ${spread.deckType}` : "",
    spread.spreadType ? `Схема: ${spread.spreadType}` : "",
    `Подтверждённые символы (${spread.cards.length}):`,
    ...lines,
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeRedrawSpreadInput(
  input: {
    system: DeckSystem;
    deckType?: string;
    spreadType?: string;
    cards: Array<{
      name: string;
      reversed?: boolean;
      position?: string;
      order?: number;
    }>;
  },
  masterId: string
): RedrawSpread {
  const system = resolveMasterDeckSystem(masterId);
  const safeCards = clampSpreadCardInput(input.cards);
  const detected = safeCards.map((c) =>
    c.reversed ? `${c.name} (перев.)` : c.name
  );
  const positions = safeCards.map((c, i) => c.position ?? `Позиция ${i + 1}`);
  const spread = mapDetectedToRedrawSpread({
    detectedCards: detected,
    system,
    deckType: input.deckType,
    spreadType: input.spreadType,
    positions,
  });
  const merged: RedrawSpread = {
    ...spread,
    cards: spread.cards.map((c, i) => ({
      ...c,
      order: safeCards[i]?.order ?? i,
      reversed: safeCards[i]?.reversed ?? c.reversed,
      position: safeCards[i]?.position ?? c.position,
    })),
  };
  return normalizeRedrawSpreadForMaster(merged, masterId);
}

export const DECK_SYSTEM_DISPLAY: Record<DeckSystem, string> = {
  runes: "Скандинавские руны",
  "tarot-veronika": "Таро и Психология",
  "tarot-marina": "Таро",
  slavic: "Славянское ведовство",
  astrology: "Джйотиш / Астрология",
  numerology: "Нумерология",
  lenormand: "Ленорман",
};
