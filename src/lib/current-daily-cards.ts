import { query } from "@/lib/db";
import { tarotCardsKey } from "@/lib/tarot";
import { TRIPLET_COOLDOWN_MS } from "@/lib/triplet-limit";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { buildHomeRecapKey } from "@/lib/home-recap";

export type CurrentDailyCardsResult =
  | {
      exists: true;
      historyId: string | null;
      sessionId: string | null;
      masterId: string;
      cardNames: string[];
      cardsKey: string;
      createdAt: string;
      recapKey: string;
    }
  | { exists: false };

function parseCardNames(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((c) => {
        if (typeof c === "string" && c.trim()) return c.trim();
        if (c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") {
          return String((c as { name: string }).name).trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.symbols)) return parseCardNames(obj.symbols);
  }
  return [];
}

function withinDailyWindow(iso: string | null | undefined, anchorIso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  if (anchorIso) {
    const a = new Date(anchorIso).getTime();
    if (Number.isFinite(a) && Math.abs(t - a) <= TRIPLET_COOLDOWN_MS) return true;
  }
  return Date.now() - t <= TRIPLET_COOLDOWN_MS;
}

/**
 * Server-authoritative "today's daily 3 cards" artifact.
 * Never treats guest_resume / arbitrary home recap as daily.
 */
export async function resolveCurrentDailyCards(
  userId: string
): Promise<CurrentDailyCardsResult> {
  const cooldown = await checkTripletCooldown(userId);
  const anchor = cooldown.lastTripletAt;

  const [sessionRes, historyRes] = await Promise.all([
    query<{
      id: string;
      character_key: string | null;
      cards: unknown;
      created_at: Date;
      updated_at: Date | null;
    }>(
      `SELECT id, character_key, cards, created_at, updated_at
       FROM sessions
       WHERE user_id = $1
         AND spread_type = 'daily'
         AND cards IS NOT NULL
       ORDER BY COALESCE(updated_at, created_at) DESC
       LIMIT 1`,
      [userId]
    ),
    query<{
      id: string;
      context_data: Record<string, unknown> | null;
      created_at: Date;
    }>(
      `SELECT id, context_data, created_at
       FROM history
       WHERE user_id = $1
         AND character_name = 'triplet'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    ),
  ]);

  const session = sessionRes.rows[0];
  const history = historyRes.rows[0];

  const sessionAt = session
    ? (session.updated_at ?? session.created_at).toISOString()
    : null;
  const historyAt = history?.created_at?.toISOString?.() ?? null;

  const sessionCards = session ? parseCardNames(session.cards) : [];
  const historyCards = parseCardNames(history?.context_data?.tarotCards);
  const historySpreadType =
    typeof history?.context_data?.spreadType === "string"
      ? history.context_data.spreadType
      : typeof history?.context_data?.type === "string"
        ? history.context_data.type
        : null;

  // History triplet rows are the authenticated daily draw artifact from /api/onboarding.
  // Require a cooldown anchor: without lastTripletDrawAt, a recent triplet/history row
  // (e.g. legacy/guest side-effects) must not be treated as "today's daily cards".
  // Reject guest_resume markers if they ever land in triplet history.
  const historyOk =
    Boolean(anchor) &&
    Boolean(history) &&
    historyCards.length >= 3 &&
    historySpreadType !== "guest_resume" &&
    historySpreadType !== "guest_intro" &&
    withinDailyWindow(historyAt, anchor);

  // Explicit spread_type='daily' sessions are authoritative even when the anchor clock
  // is slightly skewed; still require the rolling window so stale dailies don't stick.
  const sessionOk =
    Boolean(session) &&
    sessionCards.length >= 3 &&
    withinDailyWindow(sessionAt, anchor) &&
    Boolean(session.character_key?.trim());

  if (sessionOk && historyOk) {
    const sessionKey = tarotCardsKey(sessionCards.map((name) => ({ name })));
    const historyKey = tarotCardsKey(historyCards.map((name) => ({ name })));
    const cardNames = sessionKey === historyKey ? sessionCards : historyCards;
    const cardsKey = tarotCardsKey(cardNames.map((name) => ({ name })));
    const masterId =
      session.character_key!.trim() ||
      (typeof history.context_data?.masterId === "string"
        ? history.context_data.masterId
        : "veronika");
    const createdAt = historyAt && sessionAt
      ? new Date(historyAt).getTime() >= new Date(sessionAt).getTime()
        ? historyAt
        : sessionAt
      : historyAt || sessionAt!;
    return {
      exists: true,
      historyId: history.id,
      sessionId: session.id,
      masterId,
      cardNames,
      cardsKey,
      createdAt,
      recapKey: buildHomeRecapKey({
        source: "daily",
        historyId: history.id,
        sessionId: session.id,
        cardsKey,
      }),
    };
  }

  if (sessionOk) {
    const cardsKey = tarotCardsKey(sessionCards.map((name) => ({ name })));
    const masterId = session.character_key!.trim();
    const createdAt = sessionAt!;
    return {
      exists: true,
      historyId: null,
      sessionId: session.id,
      masterId,
      cardNames: sessionCards,
      cardsKey,
      createdAt,
      recapKey: buildHomeRecapKey({
        source: "daily",
        sessionId: session.id,
        cardsKey,
      }),
    };
  }

  if (historyOk) {
    const cardsKey = tarotCardsKey(historyCards.map((name) => ({ name })));
    const masterId =
      typeof history.context_data?.masterId === "string" && history.context_data.masterId.trim()
        ? history.context_data.masterId.trim()
        : "veronika";
    const createdAt = historyAt!;
    return {
      exists: true,
      historyId: history.id,
      sessionId: null,
      masterId,
      cardNames: historyCards,
      cardsKey,
      createdAt,
      recapKey: buildHomeRecapKey({
        source: "daily",
        historyId: history.id,
        cardsKey,
      }),
    };
  }

  return { exists: false };
}
