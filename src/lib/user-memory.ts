import { getUserChatHistory, getUserReadingHistory } from "@/lib/accounts";
import { getCharacterById } from "@/lib/characters";
import { getUserById } from "@/lib/users";
import { getBloggerBySlug } from "@/lib/session";
import { lifeFocusLabel, type LifeFocus } from "@/lib/astro-profile";
import { tarotCardsKey } from "@/lib/tarot";
import { ensureDb } from "@/lib/db";

const MAX_READINGS = 10;
const MAX_CHAT_TURNS = 48;
const MAX_BLOCK_CHARS = 7000;
const READING_EXCERPT = 420;
const CHAT_EXCERPT = 220;

export interface UserMemoryOptions {
  /** Current master — chat turns with this master listed first */
  currentCharacterId?: string;
  /** Skip this history row (e.g. when reusing cached reading) */
  excludeHistoryId?: string;
  /** Card signature of the active spread — highlight continuity */
  currentCardsKey?: string;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function resolveMasterName(id: string): Promise<string> {
  if (id === "triplet") return "Расклад 3 карт";
  const character = getCharacterById(id);
  if (character) return character.name;
  try {
    const blogger = await getBloggerBySlug(id);
    if (blogger) return blogger.display_name;
  } catch {
    /* offline */
  }
  return id;
}

function cardsLabel(cards: { name: string }[] | undefined): string {
  if (!cards?.length) return "";
  return cards.map((c) => c.name).join(" · ");
}

function readingExcerpt(contextData: Record<string, unknown>): string {
  const text =
    (typeof contextData.reading === "string" && contextData.reading) ||
    (typeof contextData.analysis === "string" && contextData.analysis) ||
    (typeof contextData.teaser === "string" && contextData.teaser) ||
    "";
  return truncate(text, READING_EXCERPT);
}

function formatReadingEntry(
  characterName: string,
  masterName: string,
  contextData: Record<string, unknown>,
  createdAt: Date | string
): string | null {
  const type = contextData.type as string | undefined;
  const cards = cardsLabel(contextData.tarotCards as { name: string }[] | undefined);
  const date = formatDate(createdAt);

  if (characterName === "triplet" || type === "triplet") {
    const teaser = readingExcerpt(contextData);
    return `[${date}] Выпал расклад 3 карт${cards ? `: ${cards}` : ""}${teaser ? `. ${teaser}` : ""}`;
  }

  if (type === "photo_reading") {
    const deck = typeof contextData.deckType === "string" ? contextData.deckType.split("·")[0]?.trim() : "";
    const question = typeof contextData.question === "string" ? contextData.question : "";
    const detected = Array.isArray(contextData.detectedCards)
      ? (contextData.detectedCards as string[]).filter(Boolean).join(" · ")
      : "";
    const excerpt = readingExcerpt(contextData);
    const parts = [`[${date}] Фото-расклад с ${masterName}`];
    if (deck) parts.push(`колода: ${deck}`);
    if (question) parts.push(`вопрос: «${truncate(question, 120)}»`);
    if (detected) parts.push(`карты: ${detected}`);
    else if (cards) parts.push(`карты: ${cards}`);
    if (excerpt) parts.push(excerpt);
    return parts.join(". ");
  }

  if (type === "reading") {
    const excerpt = readingExcerpt(contextData);
    return `[${date}] Расшифровка у ${masterName}${cards ? ` (${cards})` : ""}${excerpt ? `: ${excerpt}` : ""}`;
  }

  return null;
}

function formatChatTurns(
  rows: { character_id: string; role: string; content: string; created_at: Date }[],
  masterNames: Map<string, string>,
  currentCharacterId?: string
): string[] {
  const chronological = [...rows].reverse();
  const lines: string[] = [];

  const pool = currentCharacterId
    ? chronological.filter((r) => r.character_id === currentCharacterId)
    : chronological;

  for (const row of pool.slice(-MAX_CHAT_TURNS)) {
    const master = masterNames.get(row.character_id) ?? row.character_id;
    const who = row.role === "user" ? "Клиент" : master;
    const date = formatDate(row.created_at);
    lines.push(`[${date}] ${who}: ${truncate(row.content, CHAT_EXCERPT)}`);
  }

  if (lines.length < MAX_CHAT_TURNS && currentCharacterId) {
    const others = chronological
      .filter((r) => r.character_id !== currentCharacterId)
      .slice(-(MAX_CHAT_TURNS - lines.length));
    for (const row of others) {
      const master = masterNames.get(row.character_id) ?? row.character_id;
      const who = row.role === "user" ? "Клиент" : master;
      const date = formatDate(row.created_at);
      lines.push(`[${date}] ${who}: ${truncate(row.content, CHAT_EXCERPT)}`);
    }
  }

  return lines;
}

function countMemoryEligibleReadings(
  readings: { character_name: string; context_data: Record<string, unknown> }[]
): number {
  return readings.filter((row) => {
    const type = row.context_data?.type as string | undefined;
    if (row.character_name === "triplet" || type === "triplet") return true;
    if (type === "reading" || type === "photo_reading") return true;
    return false;
  }).length;
}

export async function buildUserMemoryBlock(
  profileUserId: string,
  options: UserMemoryOptions = {}
): Promise<string | null> {
  if (!(await ensureDb())) return null;

  const [readings, chatRows, user] = await Promise.all([
    getUserReadingHistory(profileUserId),
    getUserChatHistory(profileUserId),
    getUserById(profileUserId),
  ]);

  const readingLines: string[] = [];
  const masterNames = new Map<string, string>();

  for (const row of readings.slice(0, MAX_READINGS)) {
    if (options.excludeHistoryId && row.id === options.excludeHistoryId) continue;

    const name = await resolveMasterName(row.character_name);
    masterNames.set(row.character_name, name);

    const line = formatReadingEntry(
      row.character_name,
      name,
      row.context_data,
      row.created_at
    );
    if (line) readingLines.push(line);
  }

  for (const row of chatRows) {
    if (!masterNames.has(row.character_id)) {
      masterNames.set(row.character_id, await resolveMasterName(row.character_id));
    }
  }

  const chatLines = formatChatTurns(chatRows, masterNames, options.currentCharacterId);

  const profileLines: string[] = [];
  if (user?.main_question) {
    profileLines.push(`Главный вопрос клиента: «${user.main_question}».`);
  }
  if (user?.life_focus) {
    profileLines.push(
      `Тема жизни: ${lifeFocusLabel(user.life_focus as LifeFocus) ?? user.life_focus}.`
    );
  }

  if (readingLines.length === 0 && chatLines.length === 0 && profileLines.length === 0) {
    return null;
  }

  const sections: string[] = [
    "",
    "ГЛОБАЛЬНАЯ ПАМЯТЬ КЛИЕНТА (вся сохранённая история — используй как контекст):",
    "Новый расклад и ответы в чате должны опираться на этот путь: прошлые карты, вопросы, темы и переписку.",
    "Не игнорируй то, что клиент уже обсуждал. Связывай новое с предыдущим, если это уместно.",
    "Не пересказывай память дословно — вплетай естественно в ответ.",
  ];

  if (options.currentCardsKey) {
    sections.push(
      `Текущий активный расклад (карты): ${options.currentCardsKey.replace(/\|/g, " · ")}.`
    );
  }

  if (profileLines.length) {
    sections.push("", "Профиль и запрос:", ...profileLines.map((l) => `- ${l}`));
  }

  if (readingLines.length) {
    sections.push("", "Сохранённые расклады (от новых к старым):");
    readingLines.forEach((line, i) => sections.push(`${i + 1}. ${line}`));
  }

  if (chatLines.length) {
    sections.push("", "Переписка с мастерами:");
    sections.push(...chatLines.map((l) => `- ${l}`));
  }

  let block = sections.join("\n");
  if (block.length > MAX_BLOCK_CHARS) {
    block = `${block.slice(0, MAX_BLOCK_CHARS - 1)}…`;
  }

  return block;
}

export function appendUserMemoryToPrompt(systemPrompt: string, memoryBlock: string | null): string {
  if (!memoryBlock?.trim()) return systemPrompt;
  return `${systemPrompt}\n${memoryBlock}`;
}

export async function getUserMemoryPreview(profileUserId: string): Promise<{
  readingCount: number;
  chatTurnCount: number;
  hasMainQuestion: boolean;
}> {
  if (!(await ensureDb())) {
    return { readingCount: 0, chatTurnCount: 0, hasMainQuestion: false };
  }

  const [readings, chatRows, user] = await Promise.all([
    getUserReadingHistory(profileUserId),
    getUserChatHistory(profileUserId),
    getUserById(profileUserId),
  ]);

  return {
    readingCount: countMemoryEligibleReadings(readings),
    chatTurnCount: chatRows.filter((r) => r.role === "user").length,
    hasMainQuestion: Boolean(user?.main_question),
  };
}

export function cardsKeyFromTarot(cards: { name: string }[] | undefined): string | undefined {
  const key = tarotCardsKey(cards);
  return key || undefined;
}
