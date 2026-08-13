import { query } from "@/lib/db";
import { isSameProductCalendarDay } from "@/lib/product-calendar";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { buildHomeRecapKey } from "@/lib/home-recap-key";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import type { DeckSystem } from "@/lib/decks/types";
import {
  dailyCardsKey,
  isExplicitDailyTriplet,
  normalizeDailyTripletCards,
  parseSessionDailyCardNames,
  type DailyTripletCard,
} from "@/lib/daily-triplet-cards";

export type CurrentDailyCardsResult =
  | {
      exists: true;
      historyId: string | null;
      sessionId: string | null;
      masterId: string;
      deckSystem: DeckSystem;
      cards: DailyTripletCard[];
      /** @deprecated prefer cards — kept for transitional clients */
      cardNames: string[];
      cardsKey: string;
      createdAt: string;
      recapKey: string;
    }
  | { exists: false };

function withinDailyWindow(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return isSameProductCalendarDay(iso);
}

function deckFromContext(raw: unknown): DeckSystem {
  if (typeof raw === "string" && raw.trim()) return raw.trim() as DeckSystem;
  return DEFAULT_DECK_SYSTEM;
}

function cardsFromNames(names: string[]): DailyTripletCard[] {
  return names.slice(0, 3).map((name, position) => ({
    id: position,
    name,
    position,
    reversed: false,
  }));
}

/**
 * Server-authoritative "today's daily 3 cards" artifact.
 * Never merges mismatched history/session. Never uses chat updated_at for identity.
 */
export async function resolveCurrentDailyCards(
  userId: string
): Promise<CurrentDailyCardsResult> {
  const cooldown = await checkTripletCooldown(userId);
  const anchor = cooldown.lastTripletAt;

  // Explicit daily_triplet only — ordinary type=triplet never becomes current daily.
  const historyRes = await query<{
    id: string;
    context_data: Record<string, unknown> | null;
    created_at: Date;
  }>(
    `SELECT id, context_data, created_at
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'daily_triplet'
     ORDER BY created_at DESC
     LIMIT 8`,
    [userId]
  );

  let history: (typeof historyRes.rows)[number] | null = null;
  let historyCards: DailyTripletCard[] | null = null;
  for (const row of historyRes.rows) {
    const ctx = row.context_data ?? {};
    if (!isExplicitDailyTriplet(ctx)) continue;
    const cards = normalizeDailyTripletCards(ctx.tarotCards);
    if (!cards || cards.length < 3) continue;
    const at = row.created_at?.toISOString?.() ?? null;
    if (!withinDailyWindow(at)) continue;
    history = row;
    historyCards = cards;
    break;
  }

  if (history && historyCards) {
    const cardsKey = dailyCardsKey(historyCards);
    const masterId =
      typeof history.context_data?.masterId === "string" && history.context_data.masterId.trim()
        ? history.context_data.masterId.trim()
        : "veronika";
    const deckSystem = deckFromContext(history.context_data?.deckSystem);
    const createdAt = history.created_at.toISOString();

    // Match session ONLY by same cardsKey + spread_type=daily + created_at window.
    // Never ORDER BY updated_at — chat activity must not steal daily identity.
    const sessionRes = await query<{
      id: string;
      character_key: string | null;
      cards: unknown;
      created_at: Date;
    }>(
      `SELECT id, character_key, cards, created_at
       FROM sessions
       WHERE user_id = $1
         AND spread_type = 'daily'
         AND cards IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 12`,
      [userId]
    );

    let sessionId: string | null = null;
    let sessionMaster: string | null = null;
    for (const row of sessionRes.rows) {
      const names = parseSessionDailyCardNames(row.cards);
      if (names.length < 3) continue;
      const sessionKey = dailyCardsKey(
        names.map((name, position) => ({ id: position, name, position, reversed: false }))
      );
      if (sessionKey !== cardsKey) continue;
      const sessionAt = row.created_at?.toISOString?.() ?? null;
      if (!withinDailyWindow(sessionAt)) continue;
      sessionId = row.id;
      sessionMaster = row.character_key?.trim() || null;
      break;
    }

    return {
      exists: true,
      historyId: history.id,
      sessionId,
      masterId: sessionMaster || masterId,
      deckSystem,
      cards: historyCards,
      cardNames: historyCards.map((c) => c.name),
      cardsKey,
      createdAt,
      recapKey: buildHomeRecapKey({ historyId: history.id }),
    };
  }

  // Fallback: daily session without history (rare) — still order by created_at only.
  if (!anchor) return { exists: false };

  const sessionOnly = await query<{
    id: string;
    character_key: string | null;
    cards: unknown;
    created_at: Date;
  }>(
    `SELECT id, character_key, cards, created_at
     FROM sessions
     WHERE user_id = $1
       AND spread_type = 'daily'
       AND cards IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const session = sessionOnly.rows[0];
  if (!session) return { exists: false };
  const names = parseSessionDailyCardNames(session.cards);
  if (names.length < 3) return { exists: false };
  const sessionAt = session.created_at.toISOString();
  if (!withinDailyWindow(sessionAt)) return { exists: false };
  const cards = cardsFromNames(names);
  const cardsKey = dailyCardsKey(cards);
  const masterId = session.character_key?.trim() || "veronika";

  return {
    exists: true,
    historyId: null,
    sessionId: session.id,
    masterId,
    deckSystem: DEFAULT_DECK_SYSTEM,
    cards,
    cardNames: names,
    cardsKey,
    createdAt: sessionAt,
    recapKey: buildHomeRecapKey({ sessionId: session.id }),
  };
}
