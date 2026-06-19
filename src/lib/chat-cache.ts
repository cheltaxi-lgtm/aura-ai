import type { Message } from "@/types";

const CHAT_CACHE_KEY = "aura_chat_cache";
export const MIN_SPREAD_READING_CHARS = 120;

type ChatCacheEntry = Message[] | { cardsKey?: string; messages: Message[] };
type ChatCache = Record<string, ChatCacheEntry>;

function normalizeEntry(entry: ChatCacheEntry | undefined): {
  cardsKey?: string;
  messages: Message[];
} {
  if (!entry) return { messages: [] };
  if (Array.isArray(entry)) return { messages: entry };
  return { cardsKey: entry.cardsKey, messages: entry.messages ?? [] };
}

/** True when chat contains a full spread reading (not just a short teaser). */
export function chatHasSpreadReading(
  messages: Message[] | null | undefined,
  minChars = MIN_SPREAD_READING_CHARS
): boolean {
  if (!messages?.length) return false;
  return messages.some(
    (m) => m.role === "assistant" && (m.content?.trim().length ?? 0) >= minChars
  );
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

export function loadChatCache(characterId: string, cardsKey?: string): Message[] | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    if (!stored) return null;
    const cache = JSON.parse(stored) as ChatCache;
    const { cardsKey: cachedKey, messages } = normalizeEntry(cache[characterId]);
    if (!messages.length) return null;
    if (cardsKey && cachedKey && cachedKey !== cardsKey) return null;
    return deserializeMessages(messages);
  } catch {
    return null;
  }
}

export function saveChatCache(
  characterId: string,
  messages: Message[],
  cardsKey?: string
): void {
  if (typeof window === "undefined" || !messages.length) return;
  try {
    const stored = localStorage.getItem(CHAT_CACHE_KEY);
    const cache: ChatCache = stored ? JSON.parse(stored) : {};
    cache[characterId] = {
      cardsKey: cardsKey || normalizeEntry(cache[characterId]).cardsKey,
      messages: serializeMessages(messages) as unknown as Message[],
    };
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(cache));
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
