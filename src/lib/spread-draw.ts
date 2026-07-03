import { DECK_REGISTRY } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import {
  drawSeededIntentionSpread,
  drawSeededUniformSpread,
  type DrawIntention,
} from "@/lib/intention-draw";
import { topicToDrawIntention } from "@/lib/session-topics";
import { getSpread, normalizeSpreadId } from "@/lib/spreads";
import { buildSpreadSeed, type SpreadSeedParts } from "@/lib/spread-seed";
import { getSpreadRitualCopy } from "@/lib/spread-ritual-copy";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { SessionTopicId } from "@/lib/session-topics";
import { resolveSpreadDeckSystem } from "@/lib/decks";

export type { SpreadSeedParts };

export const NUMEROLOG_TABLE_SIZE = 12;

/** Full master deck — every symbol lies face-down on the table. */
export function resolveTableSize(system: DeckSystem): number {
  return DECK_REGISTRY[system].symbols.length;
}

export function resolveSpreadSessionSeed(parts: SpreadSeedParts): string {
  return buildSpreadSeed(parts);
}

function drawFullSpread(
  system: DeckSystem,
  topic: string,
  customQuestion: string | undefined,
  cardCount: number,
  seed: string
): SpreadSymbol[] {
  if (topic === "custom") {
    return drawSeededUniformSpread(system, cardCount, seed);
  }
  const intention = topicToDrawIntention(topic) as DrawIntention;
  return drawSeededIntentionSpread(system, intention, cardCount, seed);
}

/** Seeded shuffle of the entire deck — order on the magical table. */
export function buildSeededTableDeck(options: {
  system: DeckSystem;
  seed: string;
}): SpreadSymbol[] {
  const count = resolveTableSize(options.system);
  return drawSeededUniformSpread(options.system, count, `${options.seed}:table`);
}

export function parsePickedIndices(
  raw: string | null | undefined,
  tableSize: number,
  cardCount: number
): number[] {
  if (!raw?.trim()) {
    throw new Error("missing picks");
  }
  const parts = raw.split(",").map((s) => Number.parseInt(s.trim(), 10));
  if (parts.length !== cardCount) {
    throw new Error("wrong pick count");
  }
  const seen = new Set<number>();
  for (const idx of parts) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= tableSize) {
      throw new Error("invalid index");
    }
    if (seen.has(idx)) {
      throw new Error("duplicate pick");
    }
    seen.add(idx);
  }
  return parts;
}

export function resolvePickedSpread(
  tableDeck: SpreadSymbol[],
  pickedIndices: number[]
): SpreadSymbol[] {
  return pickedIndices.map((i) => tableDeck[i]!);
}

function multisetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((v, i) => v === sortedB[i]);
}

/** Validate numerolog picks — computed-only table: order of taps defines spread positions. */
export function resolveNumerologPickedSpread(
  tableDeck: SpreadSymbol[],
  pickedIndices: number[],
  computed: SpreadSymbol[]
): SpreadSymbol[] {
  if (pickedIndices.length !== computed.length) {
    throw new Error("wrong pick count");
  }

  if (tableDeck.length === computed.length) {
    const seen = new Set<number>();
    return pickedIndices.map((i) => {
      if (!Number.isInteger(i) || i < 0 || i >= tableDeck.length || seen.has(i)) {
        throw new Error("invalid numerolog picks");
      }
      seen.add(i);
      return tableDeck[i]!;
    });
  }

  const picked = resolvePickedSpread(tableDeck, pickedIndices);
  const pickedNames = picked.map((c) => c.name);
  const computedNames = computed.map((c) => c.name);
  if (!multisetsEqual(pickedNames, computedNames)) {
    throw new Error("invalid numerolog picks");
  }
  const remaining = [...computed];
  return picked.map((card) => {
    const idx = remaining.findIndex((c) => c.name === card.name);
    if (idx < 0) throw new Error("invalid numerolog picks");
    const [match] = remaining.splice(idx, 1);
    return match!;
  });
}

export function drawSeededSessionSpread(options: {
  system: DeckSystem;
  topic: string;
  customQuestion?: string;
  cardCount: number;
  seed: string;
  drawIndex?: number;
  pickedIndices?: number[];
  tableSize?: number;
}): { cards: SpreadSymbol[]; drawIndex?: number; pickedIndices?: number[] } {
  const tableSize = options.tableSize ?? resolveTableSize(options.system);

  if (options.pickedIndices?.length) {
    const tableDeck = buildSeededTableDeck({
      system: options.system,
      seed: options.seed,
    });
    if (options.pickedIndices.length !== options.cardCount) {
      throw new Error("wrong pick count");
    }
    return {
      cards: resolvePickedSpread(tableDeck, options.pickedIndices),
      pickedIndices: options.pickedIndices,
    };
  }

  const all = drawFullSpread(
    options.system,
    options.topic,
    options.customQuestion,
    options.cardCount,
    options.seed
  );
  if (options.drawIndex !== undefined) {
    const idx = options.drawIndex;
    if (idx < 0 || idx >= all.length) {
      throw new Error("drawIndex out of range");
    }
    return { cards: [all[idx]], drawIndex: idx };
  }
  return { cards: all };
}

export function buildSpreadSessionInitResponse(
  parts: SpreadSeedParts & {
    topic?: SessionTopicId | null;
    hasBirthDate?: boolean;
    system?: DeckSystem;
    numerolog?: boolean;
    numerologDrawCount?: number;
  }
) {
  const sessionSeed = resolveSpreadSessionSeed(parts);
  const cardCount = parts.numerolog
    ? Math.max(1, parts.numerologDrawCount ?? 1)
    : getSpread(normalizeSpreadId(parts.spreadId)).cardCount;
  const system =
    parts.system ??
    resolveSpreadDeckSystem(parts.spreadId, parts.masterId);
  const copy = getSpreadRitualCopy(parts.masterId, {
    topic: parts.topic ?? null,
    hasBirthDate: parts.hasBirthDate,
    cardCount,
    deckSystem: system,
  });
  const tableSize = parts.numerolog
    ? Math.max(1, parts.numerologDrawCount ?? 1)
    : resolveTableSize(system);

  return {
    sessionSeed,
    personalNote: copy.personalNote,
    ritualTitle: copy.title,
    ritualBody: copy.body,
    drawHint: copy.drawHint,
    pickHint: copy.pickHint,
    tableSize,
  };
}
