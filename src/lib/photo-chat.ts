import { generateId } from "@/lib/id";
import type { Message } from "@/types";
import type { DeckSystem, SpreadSymbol } from "@/lib/decks/types";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { resolveSpreadSymbol } from "@/lib/symbol-visuals";
import { redrawSpreadToDeckCards, type RedrawSpread } from "@/lib/photo-spread-redraw";
import type { DeckCardInput } from "@/lib/deck-card-utils";

export function buildPhotoReadingUserMessage(
  question: string,
  detectedCards: string[]
): string {
  const q = question.trim();
  if (q) return `[Фото-расклад] ${q}`;
  if (detectedCards.length) {
    return `[Фото-расклад] Карты на фото: ${detectedCards.join(", ")}`;
  }
  return "[Фото-расклад] Разбор расклада по фото";
}

export function buildPhotoReadingChatMessages(
  analysis: string,
  question: string,
  detectedCards: string[]
): Message[] {
  const now = new Date();
  return [
    {
      id: generateId(),
      role: "user",
      content: buildPhotoReadingUserMessage(question, detectedCards),
      timestamp: now,
    },
    {
      id: generateId(),
      role: "assistant",
      content: analysis.trim(),
      timestamp: new Date(now.getTime() + 1),
    },
  ];
}

const PHOTO_MARKER = "[Фото-расклад]";

export function chatHasPhotoReading(
  messages: { role: string; content: string }[] | null | undefined
): boolean {
  return Boolean(messages?.some((m) => m.role === "user" && m.content.includes(PHOTO_MARKER)));
}

function messageContentPrefix(content: string, length = 200): string {
  return content.trim().slice(0, length);
}

/** Append photo reading to an existing master chat without wiping prior messages. */
export function mergePhotoReadingIntoChat(
  existing: Message[],
  photoMessages: Message[]
): Message[] {
  if (!photoMessages.length) return existing;
  if (!existing.length) return photoMessages;

  const photoAssistant = photoMessages.find((m) => m.role === "assistant");
  if (photoAssistant) {
    const prefix = messageContentPrefix(photoAssistant.content);
    const duplicate = existing.some(
      (m) => m.role === "assistant" && messageContentPrefix(m.content) === prefix
    );
    if (duplicate) return existing;
  }

  return [...existing, ...photoMessages];
}

export interface PhotoHistoryContext {
  type?: string;
  analysis?: string;
  reading?: string;
  question?: string;
  detectedCards?: string[];
  redrawSpread?: RedrawSpread;
  sessionId?: string;
}

export interface PhotoHistoryRow {
  id?: string;
  characterName: string;
  createdAt?: string;
  contextData?: PhotoHistoryContext;
}

export function latestPhotoReadingForMaster(
  readings: PhotoHistoryRow[],
  masterId: string
): PhotoHistoryRow | null {
  const rows = readings.filter(
    (r) => r.characterName === masterId && r.contextData?.type === "photo_reading"
  );
  if (!rows.length) return null;
  return rows.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
}

export interface PhotoReadingContinuePayload {
  analysis: string;
  question?: string;
  detectedCards: string[];
  redrawSpread?: RedrawSpread;
  sessionId?: string;
  historyId?: string;
}

export function resolvePhotoReadingContinuePayload(
  readings: PhotoHistoryRow[],
  masterId: string
): PhotoReadingContinuePayload | null {
  const row = latestPhotoReadingForMaster(readings, masterId);
  if (!row?.contextData) return null;

  const analysis = (row.contextData.analysis ?? row.contextData.reading ?? "").trim();
  if (!analysis) return null;

  return {
    analysis,
    question: row.contextData.question,
    detectedCards: row.contextData.detectedCards ?? [],
    redrawSpread: row.contextData.redrawSpread,
    sessionId: row.contextData.sessionId,
    historyId: row.id,
  };
}

export function resolvePhotoSpreadFromReadings(
  readings: {
    characterName: string;
    createdAt?: string;
    contextData?: {
      type?: string;
      deckSystem?: DeckSystem;
      tarotCards?: { name: string; meaning?: string }[];
      redrawSpread?: RedrawSpread;
    };
  }[],
  masterId: string
): { cards: DeckCardInput[]; system: DeckSystem } | null {
  const photo = readings
    .filter((r) => r.characterName === masterId && r.contextData?.type === "photo_reading")
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  if (!photo?.contextData) return null;

  const redraw = photo.contextData.redrawSpread;
  if (redraw?.cards?.length) {
    return { cards: redrawSpreadToDeckCards(redraw), system: redraw.system };
  }

  const raw = photo.contextData.tarotCards ?? [];
  if (!raw.length) return null;
  const system = photo.contextData.deckSystem ?? DEFAULT_DECK_SYSTEM;
  return {
    system,
    cards: raw.map((c) => resolveSpreadSymbol(system, c)),
  };
}
