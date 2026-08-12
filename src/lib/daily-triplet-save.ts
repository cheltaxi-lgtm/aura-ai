import {
  createHistoryEntry,
  getLatestDailyTripletHistory,
  linkSessionToUser,
  recordTripletDrawAnchor,
} from "@/lib/users";
import {
  checkTripletCooldown,
  checkTripletCooldownWithClient,
} from "@/lib/triplet-limit-server";
import { updateSessionChatMetaForUser } from "@/lib/session";
import { queryClient, withTransaction } from "@/lib/db";
import {
  dailyCardsKey,
  isExplicitDailyTriplet,
  type DailyTripletCard,
} from "@/lib/daily-triplet-cards";
import { validateDailyTripletInput } from "@/lib/daily-triplet-validate";
import { buildHomeRecapKey } from "@/lib/home-recap-key";
import type { DeckSystem } from "@/lib/decks/types";

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
  /** Optional signed session claim for orphan attach. */
  claimToken?: string | null;
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
      code: "COOLDOWN" | "INVALID_CARDS" | "INVALID_MASTER" | "INVALID_DECK";
      nextAvailableAt?: string | null;
      message: string;
    };

function toArtifact(input: {
  historyId: string;
  sessionId: string | null;
  masterId: string;
  deckSystem: DeckSystem;
  cards: DailyTripletCard[];
  createdAt: string;
}): SavedDailyArtifact {
  const cardsKey = dailyCardsKey(input.cards);
  return {
    exists: true,
    historyId: input.historyId,
    sessionId: input.sessionId,
    masterId: input.masterId,
    deckSystem: input.deckSystem,
    cards: input.cards,
    cardNames: input.cards.map((c) => c.name),
    cardsKey,
    createdAt: input.createdAt,
    recapKey: buildHomeRecapKey({ historyId: input.historyId }),
  };
}

/**
 * Authenticated daily Tarot save — atomic entitlement + owner-safe session bind.
 * Ordinary type=triplet history never participates in reuse or cooldown.
 */
export async function saveAuthenticatedDailyTriplet(
  input: SaveDailyTripletInput
): Promise<SaveDailyTripletResult> {
  const validated = validateDailyTripletInput({
    cards: input.cards,
    masterId: input.masterId,
    deckSystem: input.deckSystem,
  });
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code,
      message: validated.message,
    };
  }

  const { masterId, deckSystem, cards, cardsKey } = validated;
  const teaser =
    typeof input.teaser === "string" && input.teaser.trim() ? input.teaser.trim() : undefined;
  const requestedSessionId =
    typeof input.sessionId === "string" && input.sessionId.trim()
      ? input.sessionId.trim()
      : null;

  return withTransaction(async (client) => {
    // Profile-scoped daily entitlement lock (separate namespace from guest-resume).
    await queryClient(client, `SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `daily-triplet-user:${input.userId}`,
    ]);

    const cooldown = await checkTripletCooldownWithClient(client, input.userId);

    const latest = await getLatestDailyTripletHistory(input.userId, client);
    if (latest && isExplicitDailyTriplet(latest.context_data)) {
      const existingCards = (() => {
        const raw = latest.context_data?.tarotCards;
        const again = validateDailyTripletInput({
          cards: raw,
          masterId:
            typeof latest.context_data?.masterId === "string"
              ? latest.context_data.masterId
              : masterId,
          deckSystem:
            typeof latest.context_data?.deckSystem === "string"
              ? latest.context_data.deckSystem
              : deckSystem,
        });
        return again.ok ? again.cards : null;
      })();
      const existingKey = existingCards ? dailyCardsKey(existingCards) : "";
      const ageMs = Date.now() - new Date(latest.created_at).getTime();
      if (existingCards && existingKey === cardsKey && ageMs < 60_000) {
        return {
          ok: true as const,
          reused: true,
          daily: toArtifact({
            historyId: latest.id,
            sessionId: null,
            masterId:
              typeof latest.context_data?.masterId === "string" &&
              latest.context_data.masterId.trim()
                ? latest.context_data.masterId.trim()
                : masterId,
            deckSystem:
              typeof latest.context_data?.deckSystem === "string"
                ? (latest.context_data.deckSystem as DeckSystem)
                : deckSystem,
            cards: existingCards,
            createdAt: latest.created_at.toISOString(),
          }),
          nextAvailableAt: cooldown.nextAvailableAt,
        };
      }
    }

    if (!cooldown.allowed) {
      return {
        ok: false as const,
        code: "COOLDOWN" as const,
        nextAvailableAt: cooldown.nextAvailableAt,
        message: "Новый расклад из 3 карт доступен один раз в сутки",
      };
    }

    const history = await createHistoryEntry(
      {
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
      },
      client
    );

    const drawAt = new Date().toISOString();
    await recordTripletDrawAnchor(input.userId, drawAt, client);

    let sessionId: string | null = null;
    if (requestedSessionId) {
      const linked = await linkSessionToUser(
        requestedSessionId,
        input.userId,
        input.claimToken,
        client
      );
      if (linked) {
        const updated = await updateSessionChatMetaForUser(
          requestedSessionId,
          input.userId,
          {
            characterKey: masterId,
            intention: null,
            spreadType: "daily",
            spreadId: "triplet",
            cards: cards.map((c) => c.name),
          },
          client
        );
        if (updated) sessionId = requestedSessionId;
      }
    }

    const nextCooldown = await checkTripletCooldownWithClient(client, input.userId);
    return {
      ok: true as const,
      daily: toArtifact({
        historyId: history.id,
        sessionId,
        masterId,
        deckSystem,
        cards,
        createdAt: drawAt,
      }),
      nextAvailableAt: nextCooldown.nextAvailableAt,
    };
  });
}

export type { DailyTripletCard };

/** Fast path used by tests to inspect cooldown without save. */
export { checkTripletCooldown };
