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
  resolveNumerologToolId,
  type NumerologToolId,
  type NumerologToolParams,
  buildNumerologSpreadCards,
} from "@/lib/numerology/tools";
import { resolveClientReadingText } from "@/lib/chat-reply-sanitize";
import {
  DEFAULT_SPREAD_ID,
  hasCompleteSpread,
  requiredCardCount,
  sliceForSpread,
  type SpreadId,
} from "@/lib/spreads";
import { hasActivePeriodSpread, type PeriodSpreadScope } from "@/lib/master-quick-chips";

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
    gender:
      profile.gender === "male"
        ? "Мужской"
        : profile.gender === "female"
          ? "Женский"
          : undefined,
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
    periodSpreadScope?: PeriodSpreadScope;
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

  const numerologToolId = resolveNumerologToolId(
    sessionSpreadMeta?.spreadId,
    sessionSpreadMeta?.numerologToolId
  );

  if (isNumerologMaster(characterId)) {
    const metaNames = sessionSpreadMeta?.cardNames ?? [];
    if (numerologSpreadComplete(metaNames, numerologToolId)) {
      if (numerologToolDrawCount(numerologToolId) === 0) return [];
      return buildNumerologSpreadCards(characterId, metaNames, numerologToolId).spreadCards;
    }
    return [];
  }

  if (sessionSpreadMeta?.spreadType === "photo" && sessionSpreadMeta.cardNames?.length) {
    return buildSessionSpreadCards(characterId, sessionSpreadMeta.cardNames).spreadCards;
  }

  const spreadId = sessionSpreadMeta?.spreadId ?? DEFAULT_SPREAD_ID;
  const spreadType = sessionSpreadMeta?.spreadType;
  const metaCardNames = sessionSpreadMeta?.cardNames;

  if (hasActivePeriodSpread(sessionSpreadMeta) && metaCardNames?.length) {
    if (hasCompleteSpread(metaCardNames, spreadId, spreadType ?? "new")) {
      return buildSessionSpreadCards(characterId, metaCardNames).spreadCards;
    }
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
    !hasActivePeriodSpread(sessionSpreadMeta) &&
    input.chatSessionSpread?.masterId === characterId &&
    hasCompleteSpread(
      cardNamesFromSpread(input.chatSessionSpread.cards),
      DEFAULT_SPREAD_ID,
      "daily"
    )
  ) {
    return input.chatSessionSpread.cards;
  }

  if (sessionSpreadMeta?.spreadType === "new") {
    return metaCards.length ? metaCards : [];
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

/** Tarot/numerolog cards attached to outgoing chat messages. */
export function resolveTarotCardsForOutgoingChat(input: {
  characterId: string;
  sessionSpreadMeta?: {
    spreadType?: "daily" | "new" | "photo";
    spreadId?: SpreadId | string;
    cardNames?: string[];
    periodSpreadScope?: PeriodSpreadScope;
    numerologToolId?: NumerologToolId;
    numerologToolParams?: NumerologToolParams;
  } | null;
  chatSessionSpread?: { masterId: string; cards: SpreadSymbol[] } | null;
  intentionSpread?: { masterId: string; cards: SpreadSymbol[] } | null;
  periodSpreadCards?: SpreadSymbol[] | null;
  activeProfile: StoredProfile | null;
  masters?: ShowcaseMaster[];
  sessionOnly?: boolean;
}): { name: string; meaning: string }[] | undefined {
  const {
    characterId,
    sessionSpreadMeta,
    chatSessionSpread,
    intentionSpread,
    periodSpreadCards,
    activeProfile,
    masters,
    sessionOnly = false,
  } = input;

  if (sessionSpreadMeta?.spreadType === "photo" && sessionSpreadMeta.cardNames?.length) {
    const built = buildSessionSpreadCards(characterId, sessionSpreadMeta.cardNames);
    return built.spreadCards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
  }

  if (periodSpreadCards?.length) {
    return periodSpreadCards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
  }

  if (isNumerologMaster(characterId) && activeProfile) {
    const toolId = resolveNumerologToolId(
      sessionSpreadMeta?.spreadId,
      sessionSpreadMeta?.numerologToolId
    );
    const drawCount = numerologToolDrawCount(toolId);
    const cardNames =
      sessionSpreadMeta?.cardNames ??
      (chatSessionSpread?.masterId === characterId
        ? chatSessionSpread.cards.map((c) => c.name)
        : undefined);
    if (numerologSpreadComplete(cardNames, toolId)) {
      if (drawCount === 0) return [];
      const cards =
        chatSessionSpread?.masterId === characterId && chatSessionSpread.cards.length >= drawCount
          ? chatSessionSpread.cards
          : buildNumerologSpreadCards(characterId, cardNames ?? [], toolId).spreadCards;
      return cards.slice(0, drawCount).map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
    }
    return undefined;
  }

  const chatSpreadId = sessionSpreadMeta?.spreadId ?? DEFAULT_SPREAD_ID;
  const chatSpreadType = sessionSpreadMeta?.spreadType ?? "new";

  if (
    intentionSpread?.masterId === characterId &&
    hasCompleteSpread(
      intentionSpread.cards.map((c) => c.name),
      chatSpreadId,
      chatSpreadType
    )
  ) {
    return intentionSpread.cards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
  }

  if (
    chatSessionSpread?.masterId === characterId &&
    hasCompleteSpread(
      chatSessionSpread.cards.map((c) => c.name),
      DEFAULT_SPREAD_ID,
      "daily"
    )
  ) {
    return chatSessionSpread.cards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
  }

  if (!sessionOnly) {
    const masterSpread = activeProfile
      ? resolveMasterSpread(activeProfile, characterId, masters)
      : null;
    if (
      masterSpread &&
      hasCompleteSpread(
        masterSpread.cards.map((c) => c.name),
        DEFAULT_SPREAD_ID,
        "daily"
      )
    ) {
      return masterSpread.cards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
    }

    if (activeProfile?.tarotCards?.length) {
      return activeProfile.tarotCards.map((c) => ({ name: c.name, meaning: c.meaning ?? "" }));
    }
  }

  return undefined;
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

  if (isNumerologMaster(masterId)) {
    const toolId = resolveNumerologToolId(spreadId, numerologToolId);
    if (
      !numerologSpreadComplete(
        cardNamesFromSpread(cards),
        toolId
      )
    ) {
      return base;
    }
    const required = numerologToolDrawCount(toolId);
    if (required === 0) {
      return {
        ...base,
        tarotCards: [],
        numerologToolId: toolId,
        numerologToolParams,
      };
    }
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

  if (spreadType === "photo" && cards.length) {
    return {
      ...base,
      tarotCards: cards.map((c) => ({
        name: c.name,
        meaning: c.meaning ?? "",
      })),
      deckSystem: (base.deckSystem ?? resolveMasterSpread(profile, masterId, mastersList).system) as
        | DeckSystem
        | undefined,
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
  // Do not fall back to unsanitized long text — that reopens incomplete-card leaks.
  return resolved;
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
