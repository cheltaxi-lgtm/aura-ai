import {
  createHistoryEntry,
  getLatestHistoryEntry,
  linkSessionToUser,
  recordTripletDrawAnchor,
} from "@/lib/users";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { updateSessionChatMeta } from "@/lib/session";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import {
  dailyCardsKey,
  normalizeDailyTripletCards,
  type DailyTripletCard,
} from "@/lib/daily-triplet-cards";
import { buildHomeRecapKey } from "@/lib/home-recap-key";

export type SavedDailyArtifact = {
  exists: true;
  historyId: string;
  sessionId: string | null;
  masterId: string;
  deckSystem: DeckSystem;
  cards: DailyTripletCard[];
  cardNames: string[];
  cardsKey: string;
  createdAt: string;
  recapKey: string;
};

export type SaveDailyTripletInput = {
  userId: string;
  cards: unknown;
  masterId?: string | null;
  deckSystem?: string | null;
  teaser?: string | null;
  sessionId?: string | null;
};

export type SaveDailyTripletResult =
  | {
      ok: true;
      daily: SavedDailyArtifact;
      nextAvailableAt: string | null;
      reused?: boolean;
    }
  | {
      ok: false;
      code: "COOLDOWN" | "INVALID_CARDS" | "INVALID_MASTER";
      nextAvailableAt?: string | null;
      message: string;
    };

function resolveDeckSystem(raw: unknown): DeckSystem {
  if (typeof raw === "string" && raw.trim()) return raw.trim() as DeckSystem;
  return DEFAULT_DECK_SYSTEM;
}

export async function saveAuthenticatedDailyTriplet(
  input: SaveDailyTripletInput
): Promise<SaveDailyTripletResult> {
  const cards = normalizeDailyTripletCards(input.cards);
  if (!cards) {
    return { ok: false, code: "INVALID_CARDS", message: "Нужно ровно три карты" };
  }

  const masterId =
    typeof input.masterId === "string" && input.masterId.trim()
      ? input.masterId.trim()
      : "veronika";
  if (!masterId) {
    return { ok: false, code: "INVALID_MASTER", message: "Не выбран мастер" };
  }

  const deckSystem = resolveDeckSystem(input.deckSystem);
  const cardsKey = dailyCardsKey(cards);
  const teaser =
    typeof input.teaser === "string" && input.teaser.trim() ? input.teaser.trim() : undefined;

  const cooldown = await checkTripletCooldown(input.userId);
  if (!cooldown.allowed) {
    return {
      ok: false,
      code: "COOLDOWN",
      nextAvailableAt: cooldown.nextAvailableAt,
      message: "Новый расклад из 3 карт доступен один раз в сутки",
    };
  }

  const latest = await getLatestHistoryEntry(input.userId, { characterName: "triplet" });
  if (latest) {
    const existingCards = normalizeDailyTripletCards(latest.context_data?.tarotCards);
    const existingKey = existingCards ? dailyCardsKey(existingCards) : "";
    const ageMs = Date.now() - new Date(latest.created_at).getTime();
    if (existingCards && existingKey === cardsKey && ageMs < 60_000) {
      const deck = resolveDeckSystem(latest.context_data?.deckSystem ?? deckSystem);
      const master =
        typeof latest.context_data?.masterId === "string" && latest.context_data.masterId.trim()
          ? latest.context_data.masterId.trim()
          : masterId;
      return {
        ok: true,
        reused: true,
        daily: {
          exists: true,
          historyId: latest.id,
          sessionId: null,
          masterId: master,
          deckSystem: deck,
          cards: existingCards,
          cardNames: existingCards.map((c) => c.name),
          cardsKey: existingKey,
          createdAt: latest.created_at.toISOString(),
          recapKey: buildHomeRecapKey({ historyId: latest.id }),
        },
        nextAvailableAt: cooldown.nextAvailableAt,
      };
    }
  }

  const history = await createHistoryEntry({
    userId: input.userId,
    characterName: "triplet",
    contextData: {
      type: "daily_triplet",
      spreadType: "daily",
      tarotCards: cards,
      deckSystem,
      masterId,
      ...(teaser ? { teaser } : {}),
    },
  });

  await recordTripletDrawAnchor(input.userId);

  let sessionId: string | null =
    typeof input.sessionId === "string" && input.sessionId.trim()
      ? input.sessionId.trim()
      : null;

  if (sessionId) {
    try {
      await linkSessionToUser(sessionId, input.userId);
      await updateSessionChatMeta(sessionId, {
        characterKey: masterId,
        intention: null,
        spreadType: "daily",
        spreadId: "triplet",
        cards: cards.map((c) => c.name),
      });
    } catch {
      sessionId = null;
    }
  }

  const createdAt = new Date().toISOString();
  const daily: SavedDailyArtifact = {
    exists: true,
    historyId: history.id,
    sessionId,
    masterId,
    deckSystem,
    cards,
    cardNames: cards.map((c) => c.name),
    cardsKey,
    createdAt,
    recapKey: buildHomeRecapKey({ historyId: history.id }),
  };

  const nextCooldown = await checkTripletCooldown(input.userId);
  return {
    ok: true,
    daily,
    nextAvailableAt: nextCooldown.nextAvailableAt,
  };
}

export type { DailyTripletCard };
