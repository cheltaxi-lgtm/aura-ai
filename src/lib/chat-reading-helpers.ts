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
import {
  resolveClientReadingText,
  stripMemoryLeakFromReply,
} from "@/lib/chat-reply-sanitize";

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

/** Resolve the 3-card spread used for reading API + display (daily triplet wins over master deck cache). */
export function resolveSpreadCardsForReading(input: {
  profile: StoredProfile | null;
  characterId: string;
  masters?: ShowcaseMaster[];
  sessionSpreadMeta?: {
    spreadType?: "daily" | "new" | "photo";
    cardNames?: string[];
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

  const metaCardNames = sessionSpreadMeta?.cardNames;
  const dailySpreadType = inferDailySpreadType({
    explicitSpreadType: sessionSpreadMeta?.spreadType,
    sessionSpreadType: sessionSpreadMeta?.spreadType,
    cards:
      (metaCardNames?.length ?? 0) >= 3
        ? buildSessionSpreadCards(characterId, metaCardNames!).spreadCards
        : input.chatSessionSpread?.masterId === characterId &&
            (input.chatSessionSpread.cards.length ?? 0) >= 3
          ? input.chatSessionSpread.cards
          : (profile.tarotCards?.length ?? 0) >= 3
            ? profile.tarotCards!
            : [],
    profile,
  });

  if (dailySpreadType === "daily" && (metaCardNames?.length ?? 0) >= 3) {
    return buildSessionSpreadCards(characterId, metaCardNames!).spreadCards;
  }

  if (
    sessionSpreadMeta?.spreadType === "daily" &&
    (sessionSpreadMeta.cardNames?.length ?? 0) >= 3
  ) {
    return buildSessionSpreadCards(characterId, sessionSpreadMeta.cardNames!).spreadCards;
  }

  if (
    input.chatSessionSpread?.masterId === characterId &&
    input.chatSessionSpread.cards.length >= 3
  ) {
    return input.chatSessionSpread.cards;
  }

  const masterCtx = resolveMasterSpread(profile, characterId, input.masters);
  if (masterCtx.cards.length >= 3) {
    return masterCtx.cards;
  }

  if (
    input.intentionSpread?.masterId === characterId &&
    (input.intentionSpread.cards.length ?? 0) >= 3
  ) {
    return input.intentionSpread.cards;
  }

  if (
    (sessionSpreadMeta?.cardNames?.length ?? 0) >= 3
  ) {
    return buildSessionSpreadCards(characterId, sessionSpreadMeta!.cardNames!).spreadCards;
  }

  if (
    input.chatDisplaySpread?.cards &&
    input.chatDisplaySpread.cards.length >= 3
  ) {
    return input.chatDisplaySpread.cards.map((c, i) => ({
      id: c.id ?? i + 1,
      name: c.name,
      meaning: c.meaning ?? "",
    }));
  }

  if ((profile.tarotCards?.length ?? 0) >= 3) {
    return profile.tarotCards!;
  }

  return [];
}

export function readingPayloadForMaster(
  profile: StoredProfile,
  masterId: string,
  cards: SpreadSymbol[],
  mastersList?: ShowcaseMaster[]
) {
  const base = profileApiPayload(profile, masterId, mastersList) as ReturnType<
    typeof profilePayloadForMaster
  >;
  if (cards.length >= 3) {
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
