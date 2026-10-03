import { query } from "@/lib/db";
import { TRIPLET_COOLDOWN_MS } from "@/lib/triplet-limit";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { buildHomeRecapKey } from "@/lib/home-recap-key";
import { DEFAULT_DECK_SYSTEM, DECK_REGISTRY, findSymbolByName, resolveMasterDeckSystem } from "@/lib/decks";
import { parseCardOrientation } from "@/lib/card-orientation";
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

function withinDailyWindow(iso: string | null | undefined, anchorIso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const age = Date.now() - t;
  if (!Number.isFinite(t) || age < 0 || age >= TRIPLET_COOLDOWN_MS) return false;
  if (anchorIso) {
    const a = new Date(anchorIso).getTime();
    if (Number.isFinite(a) && Math.abs(t - a) <= TRIPLET_COOLDOWN_MS) return true;
    return false;
  }
  return Date.now() - t <= TRIPLET_COOLDOWN_MS;
}

function deckFromContext(raw: unknown): DeckSystem {
  if (typeof raw === "string" && Object.hasOwn(DECK_REGISTRY, raw.trim())) return raw.trim() as DeckSystem;
  return DEFAULT_DECK_SYSTEM;
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
    const cards = normalizeDailyTripletCards(ctx.tarotCards, { allowLegacyMissingOrientation: true });
    if (!cards || cards.length < 3) continue;
    const at = row.created_at?.toISOString?.() ?? null;
    if (!anchor || !withinDailyWindow(at, anchor)) continue;
    const deck = deckFromContext(ctx.deckSystem);
    const resolvedCards = cards.map(card => {
      const symbol = findSymbolByName(deck, card.name);
      return symbol ? { ...card, id: symbol.id, name: symbol.name } : null;
    });
    if (resolvedCards.some(card => !card)) continue;
    history = row;
    historyCards = resolvedCards as DailyTripletCard[];
    break;
  }

  if (history && historyCards) {
    const masterId =
      typeof history.context_data?.masterId === "string" && history.context_data.masterId.trim()
        ? history.context_data.masterId.trim()
        : "veronika";
    const deckSystem = deckFromContext(history.context_data?.deckSystem);
    const cardsKey = dailyCardsKey(historyCards, deckSystem);
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
    for (const row of sessionRes.rows) {
      if (row.character_key?.trim() !== masterId) continue;
      if (resolveMasterDeckSystem(masterId) !== deckSystem) continue;
      const names = parseSessionDailyCardNames(row.cards);
      if (names.length !== 3) continue;
      const sessionCards = names.map((raw, position) => {
        const { name, reversed } = parseCardOrientation(raw);
        const symbol = findSymbolByName(deckSystem, name);
        return symbol ? { id: symbol.id, name: symbol.name, position, reversed } : null;
      });
      if (sessionCards.some(card => !card)) continue;
      const sessionKey = dailyCardsKey(sessionCards as DailyTripletCard[], deckSystem);
      if (sessionKey !== cardsKey) continue;
      const sessionAt = row.created_at?.toISOString?.() ?? null;
      if (!withinDailyWindow(sessionAt, anchor)) continue;
      sessionId = row.id;
      break;
    }

    return {
      exists: true,
      historyId: history.id,
      sessionId,
      masterId,
      deckSystem,
      cards: historyCards,
      cardNames: historyCards.map((c) => c.name),
      cardsKey,
      createdAt,
      recapKey: buildHomeRecapKey({ historyId: history.id }),
    };
  }

  // Editable session metadata alone cannot establish a daily artifact.
  return { exists: false };
}
