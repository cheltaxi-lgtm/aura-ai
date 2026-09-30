import { getLatestDailyTripletHistory } from "@/lib/users";
import { isExplicitDailyTriplet } from "@/lib/daily-triplet-cards";
import { validateDailyTripletInput } from "@/lib/daily-triplet-validate";
import { TRIPLET_COOLDOWN_MS } from "@/lib/triplet-limit";
import { parseCardOrientation } from "@/lib/card-orientation";
import { findSymbolByName } from "@/lib/decks";

/** Client/session metadata is a hint; only an owned, current daily artifact grants free reading. */
export async function resolveDailyFreeReading(input: {
  profileUserId: string;
  characterId: string;
  spreadType?: string | null;
  intention?: string | null;
  customQuestion?: string | null;
  tarotCards: { id?: number; name: string; reversed?: boolean }[];
}): Promise<{ cards: { id: number; name: string; meaning: string; reversed: boolean }[] } | null> {
  if (input.spreadType !== "daily" || input.intention?.trim() || input.customQuestion?.trim()) {
    return null;
  }
  if (!Array.isArray(input.tarotCards) || input.tarotCards.length !== 3) return null;

  const artifact = await getLatestDailyTripletHistory(input.profileUserId);
  if (!artifact || !isExplicitDailyTriplet(artifact.context_data)) return null;
  const age = Date.now() - new Date(artifact.created_at).getTime();
  if (!Number.isFinite(age) || age < 0 || age >= TRIPLET_COOLDOWN_MS) return null;

  const context = artifact.context_data;
  const validated = validateDailyTripletInput({
    cards: context.tarotCards,
    masterId: typeof context.masterId === "string" ? context.masterId : "veronika",
    deckSystem: typeof context.deckSystem === "string" ? context.deckSystem : null,
  });
  if (!validated.ok || input.characterId !== validated.masterId) return null;

  for (let i = 0; i < 3; i++) {
    const requested = input.tarotCards[i];
    const saved = validated.cards[i]!;
    if (!requested || typeof requested.name !== "string") return null;
    const parsed = parseCardOrientation(requested.name.replace(/\((?:перевёрнутая|перевернутая)\)/gi, " (перев.)"));
    const symbol = findSymbolByName(validated.deckSystem, parsed.name);
    if (!symbol || symbol.id !== saved.id) return null;
    if (requested.id !== undefined && requested.id !== saved.id) return null;
    if (requested.reversed !== undefined && requested.reversed !== saved.reversed) return null;
    if (parsed.reversed && !saved.reversed) return null;
  }

  // Older clients omit orientation. Always rebuild identity and meaning from the server artifact.
  return {
    cards: validated.cards.map((card) => ({
      id: card.id,
      name: card.name,
      reversed: card.reversed,
      meaning: (card.reversed ? "Перевёрнутая карта. " : "") + (findSymbolByName(validated.deckSystem, card.name)?.meaning ?? ""),
    })),
  };
}
