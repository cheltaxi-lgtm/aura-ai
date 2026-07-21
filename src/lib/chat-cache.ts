import type { Message } from "@/types";
import type { DeckSystem } from "@/lib/decks/types";
import { generateId } from "@/lib/id";
import { missingCardMentions } from "@/lib/chat-reply-sanitize";

const CHAT_CACHE_KEY = "aura_chat_cache";
const CHAT_SYNC_CHANNEL = "aura-chat-sync";

export const CHAT_HISTORY_PAGE_SIZE = 50;

const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Date.now()}`;
export const MIN_SPREAD_READING_CHARS = 120;
/** Cache key for paid session chats — must not match daily triplet spread keys */
export const SESSION_ONLY_CACHE_KEY = "__session_only__";

export type CachedChatSpread = {
  cards: {
    id?: number;
    name: string;
    meaning?: string;
    imagePath?: string;
    placeholder?: boolean;
    reversed?: boolean;
    originalName?: string;
  }[];
  system: DeckSystem;
  variant?: "triplet" | "intention" | "photo";
};

type ChatCacheEntry =
  | Message[]
  | { cardsKey?: string; spread?: CachedChatSpread; messages: Message[] };
type ChatCache = Record<string, ChatCacheEntry>;

export type ChatCacheSnapshot = {
  cardsKey?: string;
  spread?: CachedChatSpread;
  messages: Message[];
};

function normalizeEntry(entry: ChatCacheEntry | undefined): ChatCacheSnapshot {
  if (!entry) return { messages: [] };
  if (Array.isArray(entry)) return { messages: entry };
  return {
    cardsKey: entry.cardsKey,
    spread: entry.spread,
    messages: entry.messages ?? [],
  };
}

/** True when chat contains a full spread reading (not just a short teaser). */
export function chatHasSpreadReading(
  messages: Message[] | null | undefined,
  minChars = MIN_SPREAD_READING_CHARS,
  cardNames?: string[]
): boolean {
  if (!messages?.length) return false;
  return messages.some((m) => {
    if (m.role !== "assistant") return false;
    const text = m.content?.trim() ?? "";
    if (text.length < minChars) return false;
    if (cardNames?.length && missingCardMentions(text, cardNames).length > 0) {
      return false;
    }
    return true;
  });
}

/** Append spread reading once — never duplicate an existing full reading message. */
export function appendSpreadReadingMessage(
  prev: Message[],
  content: string,
  cardNames?: string[]
): Message[] {
  const text = content.trim();
  if (!text || chatHasSpreadReading(prev, MIN_SPREAD_READING_CHARS, cardNames)) {
    return prev;
  }
  return [
    ...prev,
    {
      id: generateId(),
      role: "assistant" as const,
      content: text,
      timestamp: new Date(),
    },
  ];
}

function serializeMessages(messages: Message[]): Message[] {
  return messages.map((m) => ({
    ...m,
    sceneImageUrl: undefined,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
  })) as unknown as Message[];
}

function deserializeMessages(raw: Message[]): Message[] {
  return raw.map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp as unknown as string),
  }));
}

export function loadChatCacheEntry(characterId: string): ChatCacheSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    if (!stored) return null;
    const cache = JSON.parse(stored) as ChatCache;
    const entry = normalizeEntry(cache[characterId]);
    if (!entry.messages.length && !entry.spread?.cards.length) return null;
    return {
      cardsKey: entry.cardsKey,
      spread: entry.spread,
      messages: entry.messages.length ? deserializeMessages(entry.messages) : [],
    };
  } catch {
    return null;
  }
}

export function loadChatCache(characterId: string, cardsKey?: string): Message[] | null {
  const entry = loadChatCacheEntry(characterId);
  if (!entry) return null;
  if (!entry.messages.length) return null;
  if (cardsKey && entry.cardsKey && entry.cardsKey !== cardsKey) return null;
  return entry.messages;
}

/** Load chat for master; when cardsKey is set, never mix spreads. */
export function loadChatCacheForMaster(
  characterId: string,
  cardsKey?: string
): Message[] | null {
  if (cardsKey) {
    return loadChatCache(characterId, cardsKey);
  }
  return loadChatCacheAny(characterId);
}
/** Load cached chat for a master regardless of spread cardsKey (single conversation thread). */
export function loadChatCacheAny(characterId: string): Message[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    if (!stored) return null;
    const cache = JSON.parse(stored) as ChatCache;
    const { messages } = normalizeEntry(cache[characterId]);
    if (!messages.length) return null;
    return deserializeMessages(messages);
  } catch {
    return null;
  }
}

export function notifyChatCacheUpdated(characterId: string): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(CHAT_SYNC_CHANNEL);
      bc.postMessage({ characterId, tabId: TAB_ID, at: Date.now() });
      bc.close();
    }
  } catch {
    /* ignore */
  }
}

export function subscribeChatCacheUpdates(
  onUpdate: (characterId: string) => void
): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  const bc = new BroadcastChannel(CHAT_SYNC_CHANNEL);
  bc.onmessage = (event: MessageEvent<{ characterId?: string; tabId?: string }>) => {
    if (event.data?.tabId === TAB_ID) return;
    if (event.data?.characterId) onUpdate(event.data.characterId);
  };
  return () => bc.close();
}

export function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = "__aura_ls_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function saveChatCache(
  characterId: string,
  messages: Message[],
  cardsKey?: string,
  spread?: CachedChatSpread
): void {
  if (typeof window === "undefined") return;
  // Allow empty messages when persisting spread meta (e.g. life_death ask-first).
  if (!messages.length && !spread && !cardsKey) return;
  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    const cache: ChatCache = stored ? JSON.parse(stored) : {};
    const prev = normalizeEntry(cache[characterId]);
    cache[characterId] = {
      cardsKey: cardsKey || prev.cardsKey,
      spread: spread ?? prev.spread,
      messages: messages.length
        ? (serializeMessages(messages) as unknown as Message[])
        : prev.messages ?? [],
    };
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(cache));
    notifyChatCacheUpdated(characterId);
  } catch {
    /* ignore quota errors */
  }
}

/** Master ids with a cached chat reading for the current spread */
export function mastersWithCachedReading(cardsKey: string, masterIds: string[]): string[] {
  if (!cardsKey || typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    if (!stored) return [];

    const cache = JSON.parse(stored) as ChatCache;
    const result: string[] = [];

    for (const masterId of masterIds) {
      const { cardsKey: cachedKey, messages } = normalizeEntry(cache[masterId]);
      if (cachedKey && cachedKey !== cardsKey) continue;
      const hasReading = chatHasSpreadReading(messages);      if (hasReading) result.push(masterId);
    }

    return result;
  } catch {
    return [];
  }
}

export function clearChatCache(characterId?: string): void {
  if (typeof window === "undefined") return;
  if (!characterId) {
    localStorage.removeItem(CHAT_CACHE_KEY);
    return;
  }
  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    if (!stored) return;
    const cache = JSON.parse(stored) as ChatCache;
    delete cache[characterId];
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}
