import { ensureDb } from "@/lib/db";
import { resolveSessionForUser } from "@/lib/session-access";
import type { SessionRow } from "@/lib/session";
import { getLatestHistoryEntry } from "@/lib/users";
import { tarotCardsKey } from "@/lib/tarot";

type SessionSpreadHint = Pick<SessionRow, "spread_type" | "intention" | "cards"> | null;

function cardsKeyFromNames(cards: { name: string }[] | null | undefined): string {
  if (!cards?.length) return "";
  return tarotCardsKey(cards);
}

function sessionCardsMatch(
  sessionCards: string[] | null | undefined,
  tarotCards: { name: string }[]
): boolean {
  if (!sessionCards?.length || sessionCards.length < 3 || tarotCards.length < 3) {
    return false;
  }
  const a = sessionCards.slice(0, 3).map((n) => n.trim().toLowerCase()).join("|");
  const b = tarotCards
    .slice(0, 3)
    .map((c) => c.name.trim().toLowerCase())
    .join("|");
  return a === b;
}

/** Daily triplet spread + master reading is free (no READING rune charge). */
export async function resolveIsDailyFreeReading(input: {
  profileUserId: string;
  spreadType?: string | null;
  intention?: string | null;
  sessionId?: string;
  tarotCards: { name: string }[];
  session?: SessionSpreadHint;
}): Promise<boolean> {
  if (input.spreadType === "daily") return true;
  if (input.intention?.trim()) return false;

  const requestKey = cardsKeyFromNames(input.tarotCards);
  if (!requestKey) return false;

  let session = input.session ?? null;
  if (!session && input.sessionId && (await ensureDb())) {
    const resolved = await resolveSessionForUser(input.sessionId, input.profileUserId);
    if (!resolved.error && resolved.session) {
      session = resolved.session;
    }
  }

  if (session) {
    if (session.spread_type === "daily") return true;
    if (
      session.spread_type !== "new" &&
      !session.intention &&
      sessionCardsMatch(session.cards, input.tarotCards)
    ) {
      return true;
    }
  }

  const triplet = await getLatestHistoryEntry(input.profileUserId, { characterName: "triplet" });
  if (!triplet?.context_data) return false;

  const tripletCards = triplet.context_data.tarotCards as { name: string }[] | undefined;
  const tripletKey = cardsKeyFromNames(tripletCards);
  return Boolean(tripletKey && tripletKey === requestKey);
}
