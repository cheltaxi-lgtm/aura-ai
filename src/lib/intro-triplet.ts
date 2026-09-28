import { query, queryClient, withTransaction } from "@/lib/db";
import { createHistoryEntry, linkSessionToUser } from "@/lib/users";
import { updateSessionChatMetaForUser } from "@/lib/session";
import { validateDailyTripletInput } from "@/lib/daily-triplet-validate";
import { tarotCardsKey } from "@/lib/tarot";
import { parseCardOrientation } from "@/lib/card-orientation";
import { findSymbolByName } from "@/lib/decks";
import { profileHasGuestIntroLifetimeFlag, recordGuestIntroUsed } from "@/lib/rate-limit-anchors";

type IntroRow = { id: string; context_data: Record<string, unknown>; created_at: Date };

export async function saveIntroTriplet(input: {
  userId: string;
  cards: unknown;
  masterId?: string | null;
  deckSystem?: string | null;
  sessionId?: string | null;
  claimToken?: string | null;
}) {
  const validated = validateDailyTripletInput(input);
  if (!validated.ok) return { ok: false as const, code: validated.code, message: validated.message };
  const { cards, cardsKey, masterId, deckSystem } = validated;
  return withTransaction(async (client) => {
    // Share the acquisition lock with web and Telegram guest-receipt claims.
    await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [`guest-resume-user:${input.userId}`]);
    const { rows } = await queryClient<IntroRow>(client,
      `SELECT id, context_data, created_at FROM history
       WHERE user_id = $1 AND context_data->>'type' = 'intro_triplet'
       ORDER BY created_at ASC LIMIT 1`, [input.userId]);
    const prior = rows[0];
    if (prior) {
      const priorData = validateDailyTripletInput({
        cards: prior.context_data.tarotCards,
        masterId: prior.context_data.masterId as string,
        deckSystem: prior.context_data.deckSystem as string,
      });
      if (!priorData.ok || priorData.cardsKey !== cardsKey || priorData.masterId !== masterId) {
        return { ok: false as const, code: "ALREADY_USED", message: "Первый расклад уже сохранён. Откройте его в истории." };
      }
    } else if (await profileHasGuestIntroLifetimeFlag(input.userId, client)) {
      return { ok: false as const, code: "ALREADY_USED", message: "Первый бесплатный разбор уже был получен." };
    }
    // This lifetime flag is shared with the guest first-reading entitlement.
    // Deleting the history row must never mint another free full interpretation.
    if (!prior) await recordGuestIntroUsed(input.userId, new Date(), client);
    const history = prior ?? await createHistoryEntry({
      userId: input.userId,
      characterName: "triplet",
      contextData: { type: "intro_triplet", spreadType: "intro", spreadId: "triplet", tarotCards: cards, masterId, deckSystem },
    }, client);
    const requestedSessionId = input.sessionId?.trim();
    if (requestedSessionId) {
      const linked = await linkSessionToUser(requestedSessionId, input.userId, input.claimToken, client);
      if (linked) await updateSessionChatMetaForUser(requestedSessionId, input.userId, {
        characterKey: masterId, intention: null, spreadType: "intro", spreadId: "triplet", cards: cards.map(c => c.name),
      }, client);
    }
    return { ok: true as const, intro: {
      historyId: history.id, masterId, deckSystem, cards, cardNames: cards.map(c => c.name),
      createdAt: prior?.created_at instanceof Date ? prior.created_at.toISOString() : new Date().toISOString(),
    }, reused: Boolean(prior) };
  });
}

/** A client hint never grants a free interpretation without the owned one-time artifact. */
export async function resolveIntroFreeReading(input: {
  userId: string;
  characterId: string;
  spreadType: string;
  intention: string;
  customQuestion: string;
  tarotCards: { id?: number; name: string; reversed?: boolean }[];
}) {
  if (input.spreadType !== "intro" || input.intention || input.customQuestion ||
      !Array.isArray(input.tarotCards) || input.tarotCards.length !== 3) return null;
  const { rows } = await query<IntroRow>(
    `SELECT id, context_data, created_at FROM history
     WHERE user_id = $1 AND context_data->>'type' = 'intro_triplet'
     ORDER BY created_at ASC LIMIT 1`, [input.userId]);
  const context = rows[0]?.context_data;
  if (!context) return null;
  const validated = validateDailyTripletInput({
    cards: context.tarotCards, masterId: context.masterId as string, deckSystem: context.deckSystem as string,
  });
  if (!validated.ok || validated.masterId !== input.characterId) return null;
  for (let i = 0; i < 3; i++) {
    const requested = input.tarotCards[i];
    const saved = validated.cards[i]!;
    if (!requested || typeof requested.name !== "string") return null;
    const parsed = parseCardOrientation(requested.name.replace(/\((?:перевёрнутая|перевернутая)\)/gi, " (перев.)"));
    const symbol = findSymbolByName(validated.deckSystem, parsed.name);
    if (!symbol || symbol.id !== saved.id || (requested.id !== undefined && requested.id !== saved.id) ||
        (requested.reversed !== undefined && requested.reversed !== saved.reversed) || (parsed.reversed && !saved.reversed)) return null;
  }
  return { cards: validated.cards.map(card => ({
    id: card.id, name: card.name, reversed: card.reversed,
    meaning: (card.reversed ? "Перевёрнутая карта. " : "") + (findSymbolByName(validated.deckSystem, card.name)?.meaning ?? ""),
  })), cardsKey: `intro:${tarotCardsKey(validated.cards)}` };
}
