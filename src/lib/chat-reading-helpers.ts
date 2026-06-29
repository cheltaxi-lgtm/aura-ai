import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { profilePayloadForMaster, resolveMasterSpread } from "@/lib/spread-context";
import type { SpreadSymbol } from "@/lib/decks/types";
import type { DeckCardInput } from "@/lib/deck-card-utils";
import type { StoredProfile } from "@/types/stored-profile";
import { PENDING_READING_KEY } from "@/lib/home-flow-storage";
import { buildSessionSpreadCards } from "@/lib/intention-draw";
import type { DeckSystem } from "@/lib/decks/types";
import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";
import { inferDailySpreadType } from "@/lib/daily-spread-client";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  numerologSpreadComplete,
  numerologToolDrawCount,
  type NumerologToolId,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import {
  resolveClientReadingText,
  stripMemoryLeakFromReply,
} from "@/lib/chat-reply-sanitize";
import {
  DEFAULT_SPREAD_ID,
  hasCompleteSpread,
  requiredCardCount,
  sliceForSpread,
  type SpreadId,
} from "@/lib/spreads";

export function cardLabel(card: SpreadSymbol | { name?: string } | string): string {
  if (typeof card === "string") return card;
  return card?.name ?? "карта";
}

export function buildTeaser(profile: StoredProfile | null): string {
  if (profile?.teaser) return profile.teaser;
  const names = (profile?.tarotCards ?? []).map(cardLabel);
  if (profile?.name && names.length) {
    return `${profile.name}, ваш расклад: ${names.join(" · ")}. Мастер готовит полную расшифровку…`;
  }
  return "Мастер на связи. Задайте вопрос — ответ придёт в чат.";
}

export function profileApiPayload(
  profile: StoredProfile,
  masterId?: string,
  mastersList?: ShowcaseMaster[]
) {
  if (masterId) {
    return profilePayloadForMaster(profile, masterId, mastersList);
  }
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
    tarotCards: profile.tarotCards,
  };
}

export function isDailySpreadType(spreadType?: string | null): boolean {
  return spreadType === "daily";
}

function cardNamesFromSpread(symbols: SpreadSymbol[]): string[] {
  return symbols.map((c) => c.name).filter(Boolean);
}

/** Resolve spread cards used for reading API + display (daily triplet wins over master deck cache). */
export function resolveSpreadCardsForReading(input: {
  profile: StoredProfile | null;
  characterId: string;
  masters?: ShowcaseMaster[];
  sessionSpreadMeta?: {
    spreadType?: "daily" | "new" | "photo";
    spreadId?: SpreadId | string;
    cardNames?: string[];
    numerologToolId?: NumerologToolId;
    numerologToolParams?: NumerologToolParams;
  } | null;
  intentionSpread?: {
    masterId: string;
    cards: SpreadSymbol[];
  } | null;
  chatSessionSpread?: {
    masterId: string;
    cards: SpreadSymbol[];
  } | null;
  chatDisplaySpread?: {
    cards?: DeckCardInput[];
  } | null;
}): SpreadSymbol[] {
  const { profile, characterId, sessionSpreadMeta } = input;
  if (!profile) return [];

  const spreadId = sessionSpreadMeta?.spreadId ?? DEFAULT_SPREAD_ID;
  const spreadType = sessionSpreadMeta?.spreadType;
  const metaCardNames = sessionSpreadMeta?.cardNames;
  const numerologToolId = sessionSpreadMeta?.numerologToolId;

  if (
    isNumerologMaster(characterId) &&
    metaCardNames?.length &&
    numerologSpreadComplete(metaCardNames, numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL)
  ) {
    const required = numerologToolDrawCount(numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL);
    return buildSessionSpreadCards(characterId, metaCardNames).spreadCards.slice(0, required);
  }

  const metaCards =
    metaCardNames?.length &&
    hasCompleteSpread(metaCardNames, spreadId, spreadType)
      ? buildSessionSpreadCards(characterId, metaCardNames).spreadCards
      : [];

  const dailySpreadType = inferDailySpreadType({
    explicitSpreadType: sessionSpreadMeta?.spreadType,
    sessionSpreadType: sessionSpreadMeta?.spreadType,
    cards: metaCards.length ? metaCards : [],
    profile,
  });

  if (dailySpreadType === "daily" && metaCards.length) {
    return metaCards;
  }

  if (
    sessionSpreadMeta?.spreadType === "daily" &&
    hasCompleteSpread(metaCardNames, spreadId, "daily")
  ) {
    return buildSessionSpreadCards(characterId, metaCardNames!).spreadCards;
  }

  if (
    input.chatSessionSpread?.masterId === characterId &&
    hasCompleteSpread(
      cardNamesFromSpread(input.chatSessionSpread.cards),
      DEFAULT_SPREAD_ID,
      "daily"
    )
  ) {
    return input.chatSessionSpread.cards;
  }

  const masterCtx = resolveMasterSpread(profile, characterId, input.masters);
  if (
    hasCompleteSpread(cardNamesFromSpread(masterCtx.cards), DEFAULT_SPREAD_ID, "daily")
  ) {
    return masterCtx.cards;
  }

  if (
    input.intentionSpread?.masterId === characterId &&
    hasCompleteSpread(
      cardNamesFromSpread(input.intentionSpread.cards),
      spreadId,
      spreadType ?? "new"
    )
  ) {
    return sliceForSpread(input.intentionSpread.cards, spreadId, spreadType ?? "new");
  }

  if (hasCompleteSpread(metaCardNames, spreadId, spreadType)) {
    return buildSessionSpreadCards(characterId, metaCardNames!).spreadCards;
  }

  if (
    input.chatDisplaySpread?.cards &&
    hasCompleteSpread(
      input.chatDisplaySpread.cards.map((c) => c.name),
      spreadId,
      spreadType
    )
  ) {
    const required = requiredCardCount(spreadId, spreadType);
    return input.chatDisplaySpread.cards.slice(0, required).map((c, i) => ({
      id: c.id ?? i + 1,
      name: c.name,
      meaning: c.meaning ?? "",
    }));
  }

  if (
    hasCompleteSpread(
      cardNamesFromSpread(profile.tarotCards ?? []),
      DEFAULT_SPREAD_ID,
      "daily"
    )
  ) {
    return profile.tarotCards!;
  }

  return [];
}

export function readingPayloadForMaster(
  profile: StoredProfile,
  masterId: string,
  cards: SpreadSymbol[],
  mastersList?: ShowcaseMaster[],
  spreadId?: SpreadId | string | null,
  spreadType?: string | null,
  numerologToolId?: NumerologToolId | null,
  numerologToolParams?: NumerologToolParams
) {
  const base = profileApiPayload(profile, masterId, mastersList) as ReturnType<
    typeof profilePayloadForMaster
  >;

  if (
    isNumerologMaster(masterId) &&
    numerologSpreadComplete(
      cardNamesFromSpread(cards),
      numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL
    )
  ) {
    const toolId = numerologToolId ?? DEFAULT_NUMEROLOG_SESSION_TOOL;
    const required = numerologToolDrawCount(toolId);
    return {
      ...base,
      tarotCards: cards.slice(0, required).map((c) => ({
        name: c.name,
        meaning: c.meaning ?? "",
      })),
      deckSystem: (base.deckSystem ?? resolveMasterSpread(profile, masterId, mastersList).system) as
        | DeckSystem
        | undefined,
      numerologToolId: toolId,
      numerologToolParams,
    };
  }

  if (hasCompleteSpread(cardNamesFromSpread(cards), spreadId ?? DEFAULT_SPREAD_ID, spreadType)) {
    const sliced = sliceForSpread(cards, spreadId ?? DEFAULT_SPREAD_ID, spreadType);
    return {
      ...base,
      tarotCards: sliced.map((c) => ({
        name: c.name,
        meaning: c.meaning ?? "",
      })),
      deckSystem: (base.deckSystem ?? resolveMasterSpread(profile, masterId, mastersList).system) as
        | DeckSystem
        | undefined,
    };
  }
  return base;
}

export function coerceSpreadReadingText(
  raw: string | undefined | null,
  cardNames?: string[],
  minChars = MIN_SPREAD_READING_CHARS
): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return "";

  const resolved = resolveClientReadingText(trimmed, cardNames);
  if (resolved.length >= minChars) return resolved;

  const stripped = stripMemoryLeakFromReply(trimmed);
  if (stripped.length >= minChars) return stripped;

  if (trimmed.length >= minChars) return trimmed;
  return resolved || stripped || trimmed;
}

export function persistPendingReading(masterId: string, required: number) {
  localStorage.setItem(PENDING_READING_KEY, JSON.stringify({ masterId, required }));
}

export function readPendingReading(): { masterId: string; required: number } | null {
  try {
    const raw = localStorage.getItem(PENDING_READING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { masterId?: string; required?: number };
    if (!parsed.masterId) return null;
    return { masterId: parsed.masterId, required: parsed.required ?? 0 };
  } catch {
    return null;
  }
}

export function clearPendingReading() {
  localStorage.removeItem(PENDING_READING_KEY);
}
