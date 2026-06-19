import { tarotCardsKey } from "@/lib/tarot";
import type { TarotCard } from "@/lib/tarot";

export interface StoredReadingRow {
  characterName: string;
  createdAt?: string;
  contextData?: {
    type?: string;
    reading?: string;
    tarotCards?: { name: string }[];
    sceneArt?: {
      tarot_atmosphere?: string;
      destiny_card?: string;
      final_report?: string;
      zodiac_avatar?: string;
    };
  };
}

export interface ChatReadingHint {
  characterId: string;
  role: string;
  content: string;
  createdAt: string;
}

const MIN_READING_CHARS = 120;

/** Masters who already have a reading for the current triplet spread */
export function mastersWithReadingForSpread(
  readings: StoredReadingRow[],
  cards: TarotCard[] | { name: string }[] | undefined
): string[] {
  const key = tarotCardsKey(cards);
  if (!key) return [];

  const ids = new Set<string>();
  for (const row of readings) {
    if (row.contextData?.type !== "reading") continue;
    if (row.characterName === "triplet") continue;
    if (tarotCardsKey(row.contextData.tarotCards) === key) {
      ids.add(row.characterName);
    }
  }

  return [...ids];
}

/** Latest triplet draw timestamp — chats before this belong to an older spread */
export function latestTripletCreatedAt(readings: StoredReadingRow[]): string | undefined {
  let latest: string | undefined;
  for (const row of readings) {
    if (row.characterName !== "triplet" || !row.createdAt) continue;
    if (!latest || row.createdAt > latest) latest = row.createdAt;
  }
  return latest;
}

/** Masters with a substantial assistant reply in chat after the current triplet */
export function mastersWithChatReadingSinceTriplet(
  chatRows: ChatReadingHint[],
  tripletCreatedAt?: string
): string[] {
  const latestAssistant = new Map<string, { content: string; createdAt: string }>();

  for (const row of chatRows) {
    if (row.role !== "assistant") continue;
    const prev = latestAssistant.get(row.characterId);
    if (!prev || row.createdAt > prev.createdAt) {
      latestAssistant.set(row.characterId, {
        content: row.content,
        createdAt: row.createdAt,
      });
    }
  }

  const ids: string[] = [];
  for (const [masterId, { content, createdAt }] of latestAssistant) {
    if (content.trim().length < MIN_READING_CHARS) continue;
    if (tripletCreatedAt && createdAt < tripletCreatedAt) continue;
    ids.push(masterId);
  }

  return ids;
}

export function mergeContinueMasterIds(
  readings: StoredReadingRow[],
  cards: TarotCard[] | { name: string }[] | undefined,
  extra: {
    chatRows?: ChatReadingHint[];
    cachedMasterIds?: string[];
  } = {}
): string[] {
  const ids = new Set(mastersWithReadingForSpread(readings, cards));

  const tripletAt = latestTripletCreatedAt(readings);
  for (const masterId of mastersWithChatReadingSinceTriplet(extra.chatRows ?? [], tripletAt)) {
    ids.add(masterId);
  }

  for (const masterId of extra.cachedMasterIds ?? []) {
    ids.add(masterId);
  }

  return [...ids];
}

export function hasReadingForMaster(
  readings: StoredReadingRow[],
  cards: TarotCard[] | { name: string }[] | undefined,
  masterId: string
): boolean {
  return mastersWithReadingForSpread(readings, cards).includes(masterId);
}

/** Master for «Продолжить с …» — последний, кто сделал расшифровку текущего расклада */
export function primaryContinueMasterId(
  readings: StoredReadingRow[],
  cards: TarotCard[] | { name: string }[] | undefined,
  continueMasterIds: string[],
  fallbackMasterId?: string | null
): string | null {
  if (continueMasterIds.length === 0) return fallbackMasterId ?? null;

  const cardsKey = tarotCardsKey(cards);
  let latest: { id: string; at: string } | null = null;

  for (const row of readings) {
    if (row.contextData?.type !== "reading") continue;
    if (!continueMasterIds.includes(row.characterName)) continue;
    if (cardsKey && tarotCardsKey(row.contextData.tarotCards) !== cardsKey) continue;
    const at = row.createdAt ?? "";
    if (!latest || at > latest.at) latest = { id: row.characterName, at };
  }
  if (latest) return latest.id;

  if (fallbackMasterId && continueMasterIds.includes(fallbackMasterId)) {
    return fallbackMasterId;
  }

  return continueMasterIds[0] ?? null;
}
