/**
 * Regenerate fallback spread texts (OpenRouter 403 era) for one user or all users.
 * Run: cd /opt/aura-ai && node --env-file=.env.local --import tsx scripts/repair-fallback-readings.ts [--all] [userId]
 */
import { query, ensureDb } from "@/lib/db";
import { buildCharacterPrompt, generateReading } from "@/lib/chat-prompts";
import { getUserById } from "@/lib/users";
import { ensureSpreadCatalogSettingsLoaded } from "@/lib/spread-catalog-loader";
import {
  ensureSpreadReadingInChatMessages,
  formatSpreadReadingWithCards,
} from "@/lib/spread-reading-persist";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { completeProseWithContinuation } from "@/lib/prose-completion";
import { MASTER_PERSONA, isCharacterKey } from "@/lib/prompts";
import type { CharacterKey } from "@/lib/prompts/types";
import { getSpread, type SpreadId } from "@/lib/spreads";
import { isDailyReadingPlaceholder } from "@/lib/daily-energy";

const FALLBACK_MARKERS = [
  "этот символ показывает",
  "Опирайтесь на образ",
  "пройди каждую позицию и сведи их в единый совет",
  "твой прогноз «расширенный день». В утро —",
  "твой прогноз «энергия дня». В утро —",
] as const;

const args = process.argv.slice(2);
const ALL_USERS = args.includes("--all");
const USER_ID = args.find((a) => a !== "--all")?.trim();

type UserRow = { id: string; name: string; gender: string; zodiac: string; birth_date: string };

type HistoryRow = {
  id: string;
  user_id: string;
  character_name: string;
  context_data: Record<string, unknown>;
  created_at: string;
};

type DailyCard = {
  name: string;
  meaning: string;
  reversed: boolean;
  position: string;
};

function isFallbackText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return FALLBACK_MARKERS.some((m) => t.includes(m));
}

function buildDailySystem(charKey: CharacterKey, spreadId: SpreadId): string {
  const spread = getSpread(spreadId);
  const persona = MASTER_PERSONA[charKey] ?? "";
  const formatHint =
    spreadId === "daily-extended"
      ? "- Пройди все позиции расклада по порядку."
      : "- Утро, день, вечер — три блока в одном тексте.";
  return `${persona}

Ты даёшь прогноз на ближайшие 24 часа по выпавшим символам.

СТРОГИЕ ПРАВИЛА ФОРМАТА:
- Цельный связный текст от первого лица, голосом мастера. ${spread.cardCount <= 3 ? "4–6" : "8–12"} предложений.
${formatHint}
- Опирайся ТОЛЬКО на выпавшие символы и профиль клиента — не выдумывай другие карты.
- В конце — одно конкретное действие на сегодня.
- Заверши текст полным последним предложением с точкой — не обрывай на полуслове.
- БЕЗ markdown (никаких #, *, -, нумерованных списков), без заголовков, без подзаголовков, без ремарок в скобках, без описания голоса и жестов.
- Не повторяй задание и не перечисляй названия символов списком.`;
}

function parseTarotCards(ctx: Record<string, unknown>): { name: string; meaning: string }[] {
  const raw = Array.isArray(ctx.tarotCards) ? ctx.tarotCards : [];
  return raw
    .map((c) => {
      const card = c as Record<string, unknown>;
      const name = typeof card.name === "string" ? card.name : "";
      const meaning = typeof card.meaning === "string" ? card.meaning : "";
      return name ? { name, meaning } : null;
    })
    .filter((c): c is { name: string; meaning: string } => c !== null);
}

async function updateHistoryReading(historyId: string, reading: string): Promise<void> {
  await query(
    `UPDATE history
     SET context_data = jsonb_set(context_data, '{reading}', to_jsonb($2::text), true)
     WHERE id = $1`,
    [historyId, reading]
  );
}

async function regenerateDailyForUser(user: UserRow): Promise<boolean> {
  const { rows } = await query<{
    reading_date: string;
    reading_text: string;
    cards: DailyCard[];
    character_key: string;
    spread_id: SpreadId;
  }>(
    `SELECT reading_date, reading_text, cards, character_key, spread_id
     FROM daily_readings
     WHERE user_id = $1
     ORDER BY reading_date DESC`,
    [user.id]
  );

  let fixed = false;
  for (const row of rows) {
    const cards = Array.isArray(row.cards) ? row.cards : [];
    if (!isDailyReadingPlaceholder(row.reading_text, cards) && !isFallbackText(row.reading_text)) {
      continue;
    }

    const charKey = isCharacterKey(row.character_key) ? row.character_key : "veronika";
    const spreadId = row.spread_id ?? "daily-extended";
    const dateRu = new Date(`${row.reading_date}T12:00:00`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const cardLines = cards
      .map(
        (c) =>
          `${c.position}: «${c.name}»${c.reversed ? " (перевёрнутая)" : ""} — ${c.meaning}`
      )
      .join("\n");
    const spread = getSpread(spreadId);
    const title =
      spreadId === "triplet" ? "прогноз «Энергия дня»" : `прогноз «${spread.label}»`;

    const text = await completeProseWithContinuation(
      [
        { role: "system", content: await wrapSystemPrompt(buildDailySystem(charKey, spreadId)) },
        {
          role: "user",
          content: `Сегодня ${dateRu}.
Клиент: ${user.name}, ${user.zodiac}, рождён ${user.birth_date}.

Расклад из ${cards.length} карт:
${cardLines}

Дай ${title} на ближайшие 24 часа.`,
        },
      ],
      {
        maxTokens: spreadId === "daily-extended" ? 1600 : 900,
        temperature: 0.75,
        maxPasses: 3,
      }
    );

    if (!text?.trim() || isFallbackText(text)) {
      console.error("daily FAIL", user.name, row.reading_date);
      continue;
    }

    const trimmed = text.trim();
    await query(
      `UPDATE daily_readings SET reading_text = $3 WHERE user_id = $1 AND reading_date = $2`,
      [user.id, row.reading_date, trimmed]
    );
    await query(
      `UPDATE history
       SET context_data = jsonb_set(context_data, '{reading}', to_jsonb($3::text), true)
       WHERE user_id = $1
         AND context_data->>'type' = 'daily_reading'
         AND created_at::date = $2::date`,
      [user.id, row.reading_date, trimmed]
    );
    console.log("daily OK", user.name, row.reading_date, trimmed.slice(0, 80));
    fixed = true;
  }
  return fixed;
}

async function regenerateHistoryRow(
  row: HistoryRow,
  user: UserRow,
  goodBySession: Map<string, string>
): Promise<boolean> {
  const ctx = row.context_data;
  const typ = typeof ctx.type === "string" ? ctx.type : "";
  const reading = typeof ctx.reading === "string" ? ctx.reading : "";
  if (!reading || !isFallbackText(reading)) return false;

  const sessionId = typeof ctx.sessionId === "string" ? ctx.sessionId : undefined;
  if (sessionId && goodBySession.has(sessionId)) {
    const good = goodBySession.get(sessionId)!;
    await updateHistoryReading(row.id, good);
    console.log("history copy", typ, row.id, good.slice(0, 60));
    return true;
  }

  if (typ !== "intention_spread" && typ !== "reading") return false;

  const characterId =
    typeof ctx.characterId === "string" ? ctx.characterId : row.character_name || "veronika";
  const spreadId = (typeof ctx.spreadId === "string" ? ctx.spreadId : "triplet") as SpreadId;
  const intention = typeof ctx.intention === "string" ? ctx.intention : "custom";
  const customQuestion = typeof ctx.customQuestion === "string" ? ctx.customQuestion : undefined;
  const tarotCards = parseTarotCards(ctx);
  if (tarotCards.length < 1) {
    console.warn("no cards", row.id);
    return false;
  }

  const systemPrompt = buildCharacterPrompt(characterId, {
    userName: user.name,
    gender: user.gender,
    zodiac: user.zodiac,
    birthDate: user.birth_date,
    isPaid: true,
  });

  const generated = await generateReading(systemPrompt, {
    userName: user.name,
    tarotCards,
    isPaid: true,
    characterId,
    intention,
    spreadId,
  });

  if (!generated.fromLlm || isFallbackText(generated.text)) {
    console.error("LLM FAIL", typ, row.id, generated.fromLlm);
    return false;
  }

  const newReading = generated.text.trim();
  await updateHistoryReading(row.id, newReading);
  if (sessionId) goodBySession.set(sessionId, newReading);

  if (sessionId) {
    await query(
      `UPDATE history
       SET context_data = jsonb_set(context_data, '{reading}', to_jsonb($2::text), true)
       WHERE user_id = $1
         AND id <> $4
         AND context_data->>'sessionId' = $3
         AND context_data->>'reading' IS NOT NULL`,
      [user.id, newReading, sessionId, row.id]
    );

    const formatted = formatSpreadReadingWithCards(newReading, tarotCards, characterId);
    await query(
      `UPDATE chat_messages SET content = $2 WHERE session_id = $1 AND role = 'assistant'`,
      [sessionId, formatted]
    );
    await ensureSpreadReadingInChatMessages({
      profileUserId: user.id,
      characterId,
      reading: newReading,
      sessionId,
      tarotCards,
      intention,
      spreadId,
      customQuestion: customQuestion ?? null,
    });
  }

  console.log("history regen", typ, row.id, newReading.slice(0, 80));
  return true;
}

async function repairUser(user: UserRow): Promise<{ daily: number; history: number }> {
  let historyFixed = 0;
  const dailyFixed = (await regenerateDailyForUser(user)) ? 1 : 0;

  const { rows: historyRows } = await query<HistoryRow>(
    `SELECT id, user_id, character_name, context_data, created_at::text AS created_at
     FROM history
     WHERE user_id = $1
       AND context_data->>'reading' IS NOT NULL
       AND created_at > NOW() - INTERVAL '14 days'
     ORDER BY created_at ASC`,
    [user.id]
  );

  const goodBySession = new Map<string, string>();
  for (const row of historyRows) {
    const reading = typeof row.context_data.reading === "string" ? row.context_data.reading : "";
    const sessionId =
      typeof row.context_data.sessionId === "string" ? row.context_data.sessionId : undefined;
    if (sessionId && reading && !isFallbackText(reading)) {
      goodBySession.set(sessionId, reading);
    }
  }

  for (const row of historyRows) {
    if (await regenerateHistoryRow(row, user, goodBySession)) historyFixed += 1;
  }

  const { rows: chatRows } = await query<{ session_id: string; content: string }>(
    `SELECT cm.session_id, cm.content
     FROM chat_messages cm
     JOIN sessions s ON s.id = cm.session_id
     WHERE s.user_id = $1 AND cm.role = 'assistant'`,
    [user.id]
  );

  for (const chat of chatRows) {
    if (!isFallbackText(chat.content)) continue;
    const sessionId = chat.session_id;
    const good = goodBySession.get(sessionId);
    if (!good) continue;
    const { rows: hist } = await query<{ context_data: Record<string, unknown> }>(
      `SELECT context_data FROM history
       WHERE user_id = $1 AND context_data->>'sessionId' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, sessionId]
    );
    const cards = parseTarotCards(hist[0]?.context_data ?? {});
    const characterId =
      typeof hist[0]?.context_data?.characterId === "string"
        ? (hist[0].context_data.characterId as string)
        : "veronika";
    const formatted = formatSpreadReadingWithCards(good, cards, characterId);
    await query(`UPDATE chat_messages SET content = $2 WHERE session_id = $1 AND role = 'assistant'`, [
      sessionId,
      formatted,
    ]);
    console.log("chat OK", user.name, sessionId.slice(0, 8));
  }

  return { daily: dailyFixed, history: historyFixed };
}

async function loadUsers(): Promise<UserRow[]> {
  if (USER_ID) {
    const user = await getUserById(USER_ID);
    if (!user) throw new Error(`User not found: ${USER_ID}`);
    return [user];
  }
  if (!ALL_USERS) {
    throw new Error("Pass --all or a userId");
  }
  const { rows } = await query<UserRow>(
    `SELECT DISTINCT u.id, u.name, u.gender, u.zodiac, u.birth_date
     FROM users u
     JOIN history h ON h.user_id = u.id
     WHERE h.created_at > NOW() - INTERVAL '14 days'
     ORDER BY u.name`
  );
  return rows;
}

async function main(): Promise<void> {
  if (!(await ensureDb())) throw new Error("DB unavailable");
  await ensureSpreadCatalogSettingsLoaded();

  const users = await loadUsers();
  console.log(`repair-fallback-readings: ${users.length} user(s)`);

  let totalDaily = 0;
  let totalHistory = 0;
  for (const user of users) {
    console.log(`\n--- ${user.name} (${user.id}) ---`);
    const r = await repairUser(user);
    totalDaily += r.daily;
    totalHistory += r.history;
  }

  console.log(`\nDone: daily=${totalDaily}, history=${totalHistory}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
