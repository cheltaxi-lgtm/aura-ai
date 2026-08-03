/**
 * Gate long-term / session memory injection by current question relevance.
 *
 * Keep this module free of Node-only / network dependencies (no
 * "@/lib/memory/embeddings", no "@/lib/db", etc.) — it's imported by
 * "@/lib/prompts", whose barrel export is pulled into at least one client
 * component (src/app/diary/page.tsx just for MASTER_DISPLAY/isCharacterKey),
 * so anything reachable from here ends up in the browser bundle. The
 * embeddings-based semantic upgrade of this lexical check lives in
 * session-memory-semantic.ts instead, which only server-side callers import.
 */

import { topicLabel, isSessionTopicId } from "@/lib/session-topics";

const RU_STOP = new Set([
  "и",
  "в",
  "во",
  "на",
  "не",
  "что",
  "как",
  "это",
  "про",
  "для",
  "меня",
  "мне",
  "мой",
  "моя",
  "мои",
  "тебя",
  "тебе",
  "твой",
  "твоя",
  "бы",
  "ли",
  "же",
  "у",
  "из",
  "по",
  "до",
  "от",
  "за",
  "над",
  "под",
  "при",
  "или",
  "но",
  "а",
  "то",
  "так",
  "уже",
  "ещё",
  "еще",
  "вот",
  "там",
  "тут",
  "где",
  "когда",
  "если",
  "чтобы",
  "очень",
  "просто",
  "сейчас",
  "сегодня",
  "неделю",
  "месяц",
  "расклад",
  "карта",
  "карты",
  "таро",
]);

export function tokenizeForRelevance(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !RU_STOP.has(t));
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen >= 5) return a.slice(0, 5) === b.slice(0, 5);
  if (minLen >= 4) return a.slice(0, 4) === b.slice(0, 4);
  return false;
}

function countTokenOverlap(queryTokens: string[], memoryTokens: string[]): number {
  let overlap = 0;
  for (const qt of queryTokens) {
    if (memoryTokens.some((mt) => tokenMatches(qt, mt))) overlap += 1;
  }
  return overlap;
}

/** True when memory text plausibly matches the active question. */
export function isTextRelevantToQuery(query: string, memoryText: string): boolean {
  const q = query.trim();
  const m = memoryText.trim();
  if (!q || !m) return false;

  const qLower = q.toLowerCase();
  const mLower = m.toLowerCase();
  if (mLower.includes(qLower) || qLower.includes(mLower.slice(0, Math.min(48, mLower.length)))) {
    return true;
  }

  const qTokens = tokenizeForRelevance(q);
  const mTokens = tokenizeForRelevance(m);
  if (!qTokens.length || !mTokens.length) return false;

  const overlap = countTokenOverlap(qTokens, mTokens);
  if (overlap >= 2) return true;
  if (overlap >= 1 && qTokens.some((t) => t.length >= 5 && mTokens.some((m) => tokenMatches(t, m)))) {
    return true;
  }
  return false;
}

/** Map session topic slug to Russian label for token overlap with stored facts. */
export function expandIntentionForQuery(intention: string): string {
  const trimmed = intention.trim();
  if (!trimmed) return "";
  if (isSessionTopicId(trimmed)) return topicLabel(trimmed);
  return trimmed;
}

/** What defines the «current topic» for memory retrieval. */
export function composeMemoryQueryText(parts: {
  lastUserMessage?: string | null;
  intention?: string | null;
  customQuestion?: string | null;
  mainQuestion?: string | null;
}): string {
  const last = parts.lastUserMessage?.trim() ?? "";
  // Substantive user message wins — don't pull old profile/intention into relevance.
  if (last.length >= 10) return last;

  // Short non-empty replies ("ок", "привет") during a spread must not revive
  // topic-slug memory. Empty lastUserMessage still allows intention/custom.
  if (last.length > 0) return "";

  const custom = parts.customQuestion?.trim() ?? "";
  if (parts.intention === "custom" && custom.length >= 8) {
    return custom;
  }

  const intentionText = parts.intention?.trim()
    ? expandIntentionForQuery(parts.intention.trim())
    : "";
  if (intentionText) return intentionText;
  if (custom.length >= 8) return custom;
  return "";
}

/** Trim chat history so old off-topic turns don't anchor the model. */
export function filterLlmMessagesByTopic(
  messages: { role: "user" | "assistant"; content: string }[],
  queryText: string,
  limit: number
): { role: "user" | "assistant"; content: string }[] {
  const query = queryText.trim();
  if (!query) return messages.slice(-limit);
  if (messages.length <= 2) return messages;

  let lastUserIdx = messages.length - 1;
  while (lastUserIdx >= 0 && messages[lastUserIdx].role !== "user") {
    lastUserIdx -= 1;
  }
  const tail = lastUserIdx >= 0 ? messages.slice(lastUserIdx) : messages.slice(-2);
  const head = lastUserIdx > 0 ? messages.slice(0, lastUserIdx) : [];
  const relevant = head.filter((m) => isTextRelevantToQuery(query, m.content));
  const merged = [...relevant, ...tail];
  if (merged.length <= 1 && messages.length >= 2) {
    return messages.slice(-Math.min(limit, 4));
  }
  return merged.slice(-limit);
}

export const MEMORY_USAGE_RULES = `ПРАВИЛА ПАМЯТИ:
— Ниже — факты, уже отобранные под текущий вопрос. Если тема совпадает — вплетай конкретные детали органично.
— Если клиент спрашивает о другом — не подмешивай чужие темы из памяти.
— Не перечисляй память списком и не пересказывай дословно.`;
