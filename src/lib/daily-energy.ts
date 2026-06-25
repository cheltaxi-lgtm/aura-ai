import { query } from "@/lib/db";
import { completeChat } from "@/lib/llm";
import { stripStageDirections } from "@/lib/chat-reply-sanitize";
import { MASTER_PERSONA, isCharacterKey } from "@/lib/prompts";
import type { CharacterKey } from "@/lib/prompts/types";
import { drawSpread, resolveMasterDeckSystem, type DeckSystem } from "@/lib/decks";

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
}

/** Positions framed as a forecast across the next 24 hours. */
const DAILY_POSITIONS = ["Утро", "День", "Вечер"] as const;

function finalizeDailyReadingText(raw: string | null | undefined): string {
  const fallback = "Сегодня — день тихой силы. Прислушайся к знакам вокруг.";
  const cleaned = stripStageDirections(raw?.trim() ?? "");
  return cleaned || fallback;
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

function drawDailyCards(system: DeckSystem): DailyReadingCard[] {
  const symbols = drawSpread(system, DAILY_POSITIONS.length);
  return symbols.map((symbol, i) => ({
    name: symbol.name,
    meaning: symbol.meaning,
    // Reversed orientation only makes sense for tarot-style decks.
    reversed: system.startsWith("tarot") ? Math.random() < 0.32 : false,
    position: DAILY_POSITIONS[i] ?? `Символ ${i + 1}`,
  }));
}

function buildDailySystem(charKey: CharacterKey): string {
  const persona = MASTER_PERSONA[charKey];
  return `${persona}

ЗАДАЧА: краткий прогноз «Энергия дня» на ближайшие 24 часа по трём выпавшим символам — Утро, День, Вечер — с учётом профиля клиента.

СТРОГИЕ ПРАВИЛА ФОРМАТА:
- Цельный связный текст от первого лица, голосом мастера. 4–6 предложений.
- Свяжи каждую часть суток (утро, день, вечер) с её символом из расклада; используй именно слова «утро», «день», «вечер».
- Опирайся ТОЛЬКО на выпавшие символы и профиль клиента — не выдумывай другие карты.
- В конце — одно конкретное действие на сегодня.
- БЕЗ markdown (никаких #, *, -, нумерованных списков), без заголовков, без подзаголовков, без ремарок в скобках, без описания голоса и жестов.
- Не повторяй задание и не перечисляй названия символов списком.`;
}

function buildDailyPrompt(params: {
  name: string;
  zodiac: string;
  birthDate: string;
  dateRu: string;
  cards: DailyReadingCard[];
}): string {
  const cardLines = params.cards
    .map(
      (c) =>
        `${c.position}: «${c.name}»${c.reversed ? " (перевёрнутая)" : ""} — ${c.meaning}`
    )
    .join("\n");

  return `Сегодня ${params.dateRu}.
Клиент: ${params.name}, ${params.zodiac}, рождён ${params.birthDate}.

Расклад из трёх карт на сутки:
${cardLines}

Дай прогноз «Энергия дня» на ближайшие 24 часа.`;
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
  }>(
    `SELECT reading_text, cards, deck_system FROM daily_readings
     WHERE user_id = $1 AND reading_date = $2::date`,
    [userId, today]
  );
  if (!rows[0]) return null;

  const reading = finalizeDailyReadingText(rows[0].reading_text);
  if (reading !== rows[0].reading_text.trim()) {
    await query(
      `UPDATE daily_readings SET reading_text = $3
       WHERE user_id = $1 AND reading_date = $2::date`,
      [userId, today, reading]
    );
  }
  return {
    text: reading,
    cards: parseStoredCards(rows[0].cards),
    system: (rows[0].deck_system as DeckSystem) ?? null,
    cached: true,
  };
}

export async function getOrCreateDailyReading(params: {
  userId: string;
  characterKey: string;
  name: string;
  zodiac: string;
  birthDate: string;
  localDate?: string | null;
}): Promise<DailyReadingResult> {
  const charKey: CharacterKey = isCharacterKey(params.characterKey)
    ? params.characterKey
    : "veronika";
  const system = resolveMasterDeckSystem(charKey);

  const today = resolveReadingDate(params.localDate);

  // Daily reading is one-per-day (per the user's local calendar day): if already
  // drawn (any master), return it.
  const existing = await getExistingDailyReading(params.userId, today);
  if (existing) return existing;

  // Build display date from the user's local calendar date (append T12:00 to
  // avoid timezone shifting the day when formatting).
  const dateRu = new Date(`${today}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const cards = drawDailyCards(system);

  const text = await completeChat({
    messages: [
      {
        role: "system",
        content: buildDailySystem(charKey),
      },
      {
        role: "user",
        content: buildDailyPrompt({
          name: params.name,
          zodiac: params.zodiac,
          birthDate: params.birthDate,
          dateRu,
          cards,
        }),
      },
    ],
    maxTokens: 450,
    temperature: 0.75,
  });

  const reading = finalizeDailyReadingText(text);

  await query(
    `INSERT INTO daily_readings (user_id, character_key, reading_text, cards, deck_system, reading_date)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6::date)
     ON CONFLICT (user_id, reading_date) DO UPDATE SET
       reading_text = EXCLUDED.reading_text,
       cards = EXCLUDED.cards,
       deck_system = EXCLUDED.deck_system`,
    [params.userId, charKey, reading, JSON.stringify(cards), system, today]
  );

  return { text: reading, cards, system, cached: false };
}
