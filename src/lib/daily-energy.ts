import { query } from "@/lib/db";
import { createHistoryEntry, getUserById } from "@/lib/users";
import { type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { stripStageDirections } from "@/lib/chat-reply-sanitize";
import {
  completeProseWithContinuation,
  isProseLikelyTruncated,
  trimIncompleteTrailingSentence,
} from "@/lib/prose-completion";
import { MASTER_PERSONA, isCharacterKey } from "@/lib/prompts";
import type { CharacterKey } from "@/lib/prompts/types";
import { drawSpread, resolveMasterDeckSystem, type DeckSystem } from "@/lib/decks";
import { buildSpreadSeed, createSeededRng } from "@/lib/spread-seed";
import { DEFAULT_SPREAD_ID, getSpread, isSpreadEnabled, normalizeSpreadId, type SpreadId } from "@/lib/spreads";
import { ensureSpreadCatalogSettingsLoaded } from "@/lib/spread-catalog-loader";
import { isDailyReadingUsedToday, recordDailyReadingAnchor } from "@/lib/rate-limit-anchors";

export class DailyReadingLockedError extends Error {
  spreadId: string | null;

  constructor(spreadId: string | null) {
    super("daily_reading_locked");
    this.name = "DailyReadingLockedError";
    this.spreadId = spreadId;
  }
}

export interface DailyReadingCard {
  name: string;
  meaning: string;
  reversed: boolean;
  position: string;
}

export interface DailyReadingResult {
  text: string;
  cards: DailyReadingCard[];
  system: DeckSystem | null;
  cached: boolean;
  spreadId: SpreadId;
}

/** Positions framed as a forecast across the next 24 hours. */
const DAILY_POSITIONS = ["Утро", "День", "Вечер"] as const;

export const DAILY_READING_GENERIC_FALLBACK =
  "Сегодня — день тихой силы. Прислушайтесь к знакам вокруг.";

function sanitizeDailyReadingText(raw: string | null | undefined): string {
  return trimIncompleteTrailingSentence(stripStageDirections(raw?.trim() ?? ""));
}

export function isDailyReadingPlaceholder(text: string, cards: DailyReadingCard[]): boolean {
  const t = text.trim();
  if (!t || t === DAILY_READING_GENERIC_FALLBACK) return true;
  const minLen = cards.length <= 3 ? 48 : Math.max(120, cards.length * 28);
  return t.length < minLen;
}

function buildDailyFallbackReading(
  charKey: CharacterKey,
  params: { name: string; cards: DailyReadingCard[]; spreadId: SpreadId }
): string {
  const spread = getSpread(params.spreadId);
  const title =
    params.spreadId === DEFAULT_SPREAD_ID ? "энергия дня" : spread.label.toLowerCase();
  const persona = MASTER_PERSONA[charKey]?.split("\n")[0]?.trim();
  const opener = persona
    ? `${params.name}, ${persona.charAt(0).toLowerCase()}${persona.slice(1)} — ваш прогноз «${title}».`
    : `${params.name}, ваш прогноз «${title}».`;

  const parts = params.cards.map((c) => {
    const meaning = c.meaning?.replace(/^[^:]+:\s*/, "").trim() || c.name;
    const short = meaning.split(/[.;!?…]/)[0]?.trim() || meaning;
    const pos = c.position.toLowerCase();
    return `В ${pos} — «${c.name}»${c.reversed ? " (перев.)" : ""}: ${short}.`;
  });

  const adviceCard =
    params.cards.find((c) => /совет|послание/i.test(c.position)) ??
    params.cards[params.cards.length - 1];
  const closer = adviceCard
    ? ` Главный ориентир на сегодня — «${adviceCard.name}» в позиции «${adviceCard.position}».`
    : "";

  return sanitizeDailyReadingText(`${opener} ${parts.join(" ")}${closer}`) || `${opener} ${parts.join(" ")}`;
}

async function resolveDailyReadingText(
  charKey: CharacterKey,
  raw: string | null | undefined,
  params: {
    name: string;
    zodiac: string;
    birthDate: string;
    dateRu: string;
    cards: DailyReadingCard[];
    spreadId: SpreadId;
  }
): Promise<string> {
  let text = sanitizeDailyReadingText(raw);
  if (text && !isDailyReadingPlaceholder(text, params.cards)) return text;

  const fromLlm = await generateDailyReadingText(charKey, params);
  text = sanitizeDailyReadingText(fromLlm);
  if (text && !isDailyReadingPlaceholder(text, params.cards)) return text;

  if (fromLlm) {
    console.warn("Daily reading LLM output too short, using card fallback", {
      spreadId: params.spreadId,
      cardCount: params.cards.length,
      len: fromLlm.length,
    });
  } else {
    console.warn("Daily reading LLM empty, using card fallback", {
      spreadId: params.spreadId,
      cardCount: params.cards.length,
    });
  }

  return buildDailyFallbackReading(charKey, params);
}

function parseStoredCards(raw: unknown): DailyReadingCard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : "";
      if (!name) return null;
      return {
        name,
        meaning: typeof obj.meaning === "string" ? obj.meaning : "",
        reversed: Boolean(obj.reversed),
        position: typeof obj.position === "string" ? obj.position : DAILY_POSITIONS[i] ?? `Символ ${i + 1}`,
      };
    })
    .filter((c): c is DailyReadingCard => c !== null);
}

function drawDailyCards(
  system: DeckSystem,
  spreadId: SpreadId = DEFAULT_SPREAD_ID,
  seedParts?: {
    userId: string;
    birthDate: string;
    characterKey: string;
    localDate: string;
  }
): DailyReadingCard[] {
  const rng = seedParts
    ? createSeededRng(
        buildSpreadSeed({
          userId: seedParts.userId,
          birthDate: seedParts.birthDate,
          masterId: seedParts.characterKey,
          spreadId,
          localDate: seedParts.localDate,
        })
      )
    : Math.random;
  if (spreadId === DEFAULT_SPREAD_ID) {
    const symbols = drawSpread(system, DAILY_POSITIONS.length, rng);
    return symbols.map((symbol, i) => ({
      name: symbol.name,
      meaning: symbol.meaning,
      reversed: system.startsWith("tarot") ? rng() < 0.32 : false,
      position: DAILY_POSITIONS[i] ?? `Символ ${i + 1}`,
    }));
  }

  const spread = getSpread(spreadId);
  const symbols = drawSpread(system, spread.cardCount, rng);
  return symbols.map((symbol, i) => ({
    name: symbol.name,
    meaning: symbol.meaning,
    reversed: system.startsWith("tarot") ? rng() < 0.32 : false,
    position: spread.positions[i]?.label ?? `Символ ${i + 1}`,
  }));
}

function buildDailySystem(charKey: CharacterKey, spreadId: SpreadId = DEFAULT_SPREAD_ID): string {
  const persona = MASTER_PERSONA[charKey];
  const spread = getSpread(spreadId);
  const taskHint =
    spreadId === DEFAULT_SPREAD_ID
      ? "краткий прогноз «Энергия дня» на ближайшие 24 часа по трём выпавшим символам — Утро, День, Вечер — с учётом профиля клиента."
      : `краткий прогноз «${spread.label}» на ближайшие 24 часа по ${spread.cardCount} выпавшим символам (каждая позиция расклада отдельно) с учётом профиля клиента.`;
  const formatHint =
    spreadId === DEFAULT_SPREAD_ID
      ? "- Свяжи каждую часть суток (утро, день, вечер) с её символом из расклада; используй именно слова «утро», «день», «вечер»."
      : `- Пройди по всем ${spread.cardCount} позициям расклада; назови каждую позицию и её символ.`;

  return `${persona}

ЗАДАЧА: ${taskHint}

СТРОГИЕ ПРАВИЛА ФОРМАТА:
- Цельный связный текст от первого лица, голосом мастера. ${spread.cardCount <= 3 ? "4–6" : "8–12"} предложений.
${formatHint}
- Опирайся ТОЛЬКО на выпавшие символы и профиль клиента — не выдумывай другие карты.
- В конце — одно конкретное действие на сегодня.
- Заверши текст полным последним предложением с точкой — не обрывай на полуслове.
- БЕЗ markdown (никаких #, *, -, нумерованных списков), без заголовков, без подзаголовков, без ремарок в скобках, без описания голоса и жестов.
- Не повторяй задание и не перечисляй названия символов списком.`;
}

function buildDailyPrompt(params: {
  name: string;
  zodiac: string;
  birthDate: string;
  dateRu: string;
  cards: DailyReadingCard[];
  spreadId?: SpreadId;
}): string {
  const cardLines = params.cards
    .map(
      (c) =>
        `${c.position}: «${c.name}»${c.reversed ? " (перевёрнутая)" : ""} — ${c.meaning}`
    )
    .join("\n");

  const spread = getSpread(params.spreadId ?? DEFAULT_SPREAD_ID);
  const title =
    params.spreadId === DEFAULT_SPREAD_ID
      ? "прогноз «Энергия дня»"
      : `прогноз «${spread.label}»`;

  return `Сегодня ${params.dateRu}.
Клиент: ${params.name}, ${params.zodiac}, рождён ${params.birthDate}.

Расклад из ${params.cards.length} карт:
${cardLines}

Дай ${title} на ближайшие 24 часа.`;
}

async function generateDailyReadingText(
  charKey: CharacterKey,
  promptParams: {
    name: string;
    zodiac: string;
    birthDate: string;
    dateRu: string;
    cards: DailyReadingCard[];
    spreadId?: SpreadId;
  }
): Promise<string | null> {
  const spreadId = promptParams.spreadId ?? DEFAULT_SPREAD_ID;
  const messages: ChatMessage[] = [
    { role: "system", content: await wrapSystemPrompt(buildDailySystem(charKey, spreadId)) },
    { role: "user", content: buildDailyPrompt({ ...promptParams, spreadId }) },
  ];

  return completeProseWithContinuation(messages, {
    maxTokens: spreadId === "daily-extended" ? 1600 : 900,
    temperature: 0.75,
    maxPasses: spreadId === "daily-extended" ? 3 : 2,
  });
}

async function repairTruncatedDailyReading(
  charKey: CharacterKey,
  partial: string,
  spreadId: SpreadId = DEFAULT_SPREAD_ID
): Promise<string | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: await wrapSystemPrompt(buildDailySystem(charKey, spreadId)) },
    {
      role: "user",
      content: `Прогноз «${getSpread(spreadId).label}» оборвался на середине. Допиши его с места обрыва до конца (все оставшиеся позиции + одно действие на сегодня). Не повторяй уже написанное.\n\n${partial}`,
    },
  ];

  const continued = await completeProseWithContinuation(messages, {
    maxTokens: 500,
    temperature: 0.7,
    maxPasses: 1,
  });
  if (!continued?.trim()) return null;

  const merged = continued.startsWith(partial.trim())
    ? continued
    : `${partial.trim()} ${continued.trim()}`;
  return sanitizeDailyReadingText(merged);
}

/** Validate a YYYY-MM-DD string; fall back to the server's UTC date. */
function resolveReadingDate(localDate?: string | null): string {
  if (typeof localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return localDate;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Fetch today's reading without creating one. Returns null if not drawn yet. */
export async function getExistingDailyReading(
  userId: string,
  localDate?: string | null
): Promise<DailyReadingResult | null> {
  const today = resolveReadingDate(localDate);
  const { rows } = await query<{
    reading_text: string;
    cards: unknown;
    deck_system: string | null;
    character_key: string;
    spread_id: string | null;
  }>(
    `SELECT reading_text, cards, deck_system, character_key, spread_id FROM daily_readings
     WHERE user_id = $1 AND reading_date = $2::date`,
    [userId, today]
  );
  if (!rows[0]) return null;

  const storedSpreadId = normalizeSpreadId(rows[0].spread_id);

  const charKey: CharacterKey = isCharacterKey(rows[0].character_key)
    ? rows[0].character_key
    : "veronika";

  const cards = parseStoredCards(rows[0].cards);
  let reading = sanitizeDailyReadingText(rows[0].reading_text);

  if (isDailyReadingPlaceholder(reading, cards)) {
    const user = await getUserById(userId);
    if (user) {
      const dateRu = new Date(`${today}T12:00:00`).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      reading = await resolveDailyReadingText(charKey, reading, {
        name: user.name,
        zodiac: user.zodiac,
        birthDate: user.birth_date,
        dateRu,
        cards,
        spreadId: storedSpreadId,
      });
    } else if (!reading) {
      reading = DAILY_READING_GENERIC_FALLBACK;
    }
  }

  if (isProseLikelyTruncated(reading)) {
    const repaired = await repairTruncatedDailyReading(charKey, reading, storedSpreadId);
    if (repaired && repaired !== reading) {
      reading = repaired;
    }
  }

  if (reading !== rows[0].reading_text.trim()) {
    await query(
      `UPDATE daily_readings SET reading_text = $3
       WHERE user_id = $1 AND reading_date = $2::date`,
      [userId, today, reading]
    );
  }

  const system = (rows[0].deck_system as DeckSystem) ?? null;

  void syncDailyReadingHistory({
    userId,
    characterKey: charKey,
    readingDate: today,
    reading,
    cards,
    system: system ?? resolveMasterDeckSystem(charKey),
    spreadId: storedSpreadId,
  }).catch((err) => console.warn("Daily reading history sync failed:", err));

  return {
    text: reading,
    cards,
    system,
    cached: true,
    spreadId: storedSpreadId,
  };
}

export async function getOrCreateDailyReading(params: {
  userId: string;
  characterKey: string;
  name: string;
  zodiac: string;
  birthDate: string;
  localDate?: string | null;
  spreadId?: SpreadId | string | null;
}): Promise<DailyReadingResult> {
  const charKey: CharacterKey = isCharacterKey(params.characterKey)
    ? params.characterKey
    : "veronika";
  const system = resolveMasterDeckSystem(charKey);
  const requestedSpreadId = normalizeSpreadId(params.spreadId);
  let drawSpreadId: SpreadId =
    requestedSpreadId === "daily-extended" ? "daily-extended" : DEFAULT_SPREAD_ID;
  await ensureSpreadCatalogSettingsLoaded();
  if (drawSpreadId === "daily-extended" && !isSpreadEnabled("daily-extended")) {
    drawSpreadId = DEFAULT_SPREAD_ID;
  }

  const today = resolveReadingDate(params.localDate);

  const existing = await getExistingDailyReading(params.userId, today);
  if (existing) {
    const existingSpreadId = normalizeSpreadId(existing.spreadId);
    const wantsExtendedUpgrade =
      drawSpreadId === "daily-extended" && existingSpreadId !== "daily-extended";
    if (!wantsExtendedUpgrade) return existing;
  }

  const usage = await isDailyReadingUsedToday(params.userId, today);
  if (usage.used && !usage.hasContent) {
    throw new DailyReadingLockedError(usage.spreadId);
  }

  // Build display date from the user's local calendar date (append T12:00 to
  // avoid timezone shifting the day when formatting).
  const dateRu = new Date(`${today}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const cards = drawDailyCards(system, drawSpreadId, {
    userId: params.userId,
    birthDate: params.birthDate,
    characterKey: charKey,
    localDate: today,
  });

  const text = await generateDailyReadingText(charKey, {
    name: params.name,
    zodiac: params.zodiac,
    birthDate: params.birthDate,
    dateRu,
    cards,
    spreadId: drawSpreadId,
  });

  const reading = await resolveDailyReadingText(charKey, text, {
    name: params.name,
    zodiac: params.zodiac,
    birthDate: params.birthDate,
    dateRu,
    cards,
    spreadId: drawSpreadId,
  });

  await query(
    `INSERT INTO daily_readings (user_id, character_key, reading_text, cards, deck_system, reading_date, spread_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::date, $7)
     ON CONFLICT (user_id, reading_date) DO UPDATE SET
       reading_text = EXCLUDED.reading_text,
       cards = EXCLUDED.cards,
       deck_system = EXCLUDED.deck_system,
       spread_id = EXCLUDED.spread_id`,
    [params.userId, charKey, reading, JSON.stringify(cards), system, today, drawSpreadId]
  );

  await syncDailyReadingHistory({
    userId: params.userId,
    characterKey: charKey,
    readingDate: today,
    reading,
    cards,
    system,
    spreadId: drawSpreadId,
  });

  await recordDailyReadingAnchor(params.userId, today, drawSpreadId);

  return { text: reading, cards, system, cached: false, spreadId: drawSpreadId };
}

async function syncDailyReadingHistory(params: {
  userId: string;
  characterKey: CharacterKey;
  readingDate: string;
  reading: string;
  cards: DailyReadingCard[];
  system: DeckSystem;
  spreadId: SpreadId;
}): Promise<void> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM history
     WHERE user_id = $1
       AND character_name = 'daily_energy'
       AND context_data->>'readingDate' = $2
     LIMIT 1`,
    [params.userId, params.readingDate]
  );
  if (existing.rows[0]) return;

  await createHistoryEntry({
    userId: params.userId,
    characterName: "daily_energy",
    isPaid: false,
    contextData: {
      type: "daily_reading",
      spreadId: params.spreadId,
      reading: params.reading,
      readingDate: params.readingDate,
      characterKey: params.characterKey,
      deckSystem: params.system,
      tarotCards: params.cards.map((c) => ({
        name: c.name,
        meaning: c.meaning,
        position: c.position,
        reversed: c.reversed,
      })),
    },
  });
}
