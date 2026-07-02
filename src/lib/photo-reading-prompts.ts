import { completeChat, isRejectedLlmOutput, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { todayLabelRu } from "@/lib/prompt-date";
import { buildChatPrompt, buildHumanChatPrompt } from "@/lib/chat-prompts";
import type { UserContext } from "@/lib/chat-prompts";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { isAiMasterId } from "@/lib/showcase-masters";

export interface PhotoReadingContext extends Partial<UserContext> {
  question?: string;
}

export interface PhotoReadingMetadata {
  deckType?: string;
  spreadType?: string;
  detectedCards: string[];
}

import { MAX_SPREAD_CARD_COUNT } from "@/lib/spreads";
import { spreadFinalConclusionRules } from "@/lib/prompts/format";

const PHOTO_READING_RULES = `
Ты — эксперт по чтению карт по фото: классическое таро (78), Марсель, Тота (Кроули), Ленорман (36), оракулы, метафорические и психологические колоды, авторские, тематические и коллекционные колоды, а также скриншоты из мобильных приложений (Golden Thread, Labyrinthos, Facade, Tarot.com и др.).

ЭТАП 1 — АВТООПРЕДЕЛЕНИЕ КОЛОДЫ (обязательно):
- Определи тип колоды по стилю иллюстраций, символам, рамкам, языку подписей, номерам мастей.
- Примеры: Rider-Waite / Универсальное, Марсельское, Тота, Shadow Work, Wild Unknown, Deviant Moon, оракул «Goddess», колода Ленорман, смешанная выкладка из разных колод.
- Если виден логотип или интерфейс приложения — укажи источник.
- Если колода неизвестная — опиши честно («авторская колода, минималистичный стиль») и читай по названиям/образам на картах.
- Для Ленорман используй названия Ленорман (Всадник, Клевер, Корабль…), не смешивай с таро.
- Для оракулов — название с карты или краткое описание образа в кавычках.
- Укажи уверенность: высокая / средняя / низкая.

ЭТАП 2 — РАСКЛАД И НАЗНАЧЕНИЕ:
- Определи схему: одна карта, три карты, кельтский крест, подкова, «да/нет», годовой, расклад на отношения/карьеру/решение, расклад из приложения с подписями позиций, свободная выкладка и т.д.
- Читай подписи позиций на фото буквально (Прошлое, Mind/Body/Spirit, Ситуация/Препятствие/Совет…).
- Если назначение не подписано — предположи по числу карт и геометрии, отметь это в строке РАСКЛАД.

ЭТАП 3 — РАСПОЗНАВАНИЕ КАРТ:
- Называй карты в терминологии ЭТОЙ колоды на фото (RWS: «Two of Swords» или «2 Мечей», Тота: «Adjustment», Ленорман: «Всадник», оракул: текст с карты).
- Перевёрнутые — «(перев.)» после названия.
- Разбери все различимые карты (1–20+); при незнакомой колоде всё равно перечисли видимые названия/образы.
- Если часть неразборчива — перечисли только видимые и попроси более чёткое фото в конце расшифровки.

ФОРМАТ ОТВЕТА (строго в начале, три строки):
КОЛОДА: [тип/название · уверенность: высокая/средняя/низкая]
РАСКЛАД: [название или описание · N карт · назначение если ясно]
КАРТЫ: «Карта1» · «Карта2» · …

Затем — персональная расшифровка от лица мастера, 4–8 абзацев на русском:
- учитывай систему колоды (таро ≠ Ленорман ≠ оракул);
- связывай значение с позицией в раскладе;
- свяжи с вопросом клиента и астрологическим профилем (если есть);
- не используй markdown (* ** #);
- соблюдай глобальные правила мастера: русский язык, честность без цензуры, пять-пятнадцать предложений;
- оставайся в образе; на прямой вопрос «ты ИИ?» — честно, в образе мастера;
- применяй политику честности: не смягчай негатив, не отказывай от «тёмных» тем, если они видны в раскладе или в вопросе.

${spreadFinalConclusionRules(MAX_SPREAD_CARD_COUNT)}`;

/** Rules for the SECOND step: cards already confirmed in the Zovus deck, no recognition needed. */
const PHOTO_INTERPRETATION_RULES = `
РЕЖИМ: РАСШИФРОВКА ПОДТВЕРЖДЁННОГО РАСКЛАДА.
Карты уже распознаны и подтверждены клиентом — НЕ определяй колоду заново, НЕ выводи служебные строки (КОЛОДА/РАСКЛАД/КАРТЫ), НЕ перечисляй карты списком с номерами.

Дай персональную расшифровку от лица мастера, 4–8 абзацев на русском живым текстом:
- по каждой карте: название → значение в её позиции расклада → вывод для клиента;
- свяжи с вопросом клиента и астрологическим профилем (если есть);
- честно, без смягчения негатива и без отказа от «тёмных» тем;
- не используй markdown (* ** #) и нумерованные списки;
- оставайся в образе; на прямой вопрос «ты ИИ?» — честно, в образе мастера;
- пиши только готовый текст для клиента — без повтора этих правил, профиля и структуры промпта.

${spreadFinalConclusionRules(MAX_SPREAD_CARD_COUNT)}`;

function buildPersonaBase(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null; knowledge?: string }
): string {
  let base = buildChatPrompt(characterId, ctx);

  if (bloggerOverlay && isAiMasterId(characterId)) {
    base += `\n\nСтиль мастера ${bloggerOverlay.display_name}: ${bloggerOverlay.style_notes ?? ""}`;
    if (bloggerOverlay.knowledge) {
      base += `\nБаза знаний:\n${bloggerOverlay.knowledge}`;
    }
  }

  if (bloggerOverlay && !isAiMasterId(characterId)) {
    base = buildHumanChatPrompt(bloggerOverlay, ctx, bloggerOverlay.knowledge);
  }

  return base;
}

export function buildPhotoReadingPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null; knowledge?: string }
): string {
  const base = buildPersonaBase(characterId, ctx, bloggerOverlay);

  const questionLine = ctx.question?.trim()
    ? `Вопрос клиента к этому раскладу: «${ctx.question.trim()}».`
    : "Клиент не задал отдельный вопрос — определи назначение расклада по схеме и дай общую расшифровку.";

  return `${base}

${PHOTO_READING_RULES}

${questionLine}
Сегодня: ${ctx.today ?? todayLabelRu()}.`;
}

export function buildPhotoInterpretationPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null; knowledge?: string }
): string {
  const base = buildPersonaBase(characterId, ctx, bloggerOverlay);

  return `${base}

${PHOTO_INTERPRETATION_RULES}

Сегодня: ${ctx.today ?? todayLabelRu()}.`;
}

export function buildPhotoVisionMessage(
  text: string,
  imageBase64: string,
  mimeType = "image/jpeg"
): ChatMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${imageBase64}` },
      },
    ],
  };
}

function parseMetadataLine(analysis: string, key: string): string | undefined {
  const match = analysis.match(new RegExp(`^${key}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() || undefined;
}

export interface DetectedCardEntry {
  name: string;
  reversed: boolean;
}

function splitCardTokens(raw: string): string[] {
  const numbered = raw
    .split(/\n/)
    .flatMap((line) => {
      const m = line.match(/^\s*\d+[\.)]\s*(.+)$/);
      return m ? [m[1]] : [line];
    })
    .join(" · ");

  return numbered
    .split(/[·•|/;,]+/)
    .map((s) => s.replace(/[«»"']/g, "").trim())
    .filter(Boolean);
}

function parseJsonCardArray(raw: string): DetectedCardEntry[] {
  try {
    const arr = JSON.parse(raw) as Array<{ name?: string; reversed?: boolean }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        reversed: Boolean(item.reversed),
      }))
      .filter((c) => c.name.length > 0);
  } catch {
    return [];
  }
}

function parseDetectedCardsJson(analysis: string): DetectedCardEntry[] {
  const labeled = analysis.match(/КАРТЫ_JSON:\s*(\[[\s\S]*?\])/i);
  if (labeled) {
    const parsed = parseJsonCardArray(labeled[1]);
    if (parsed.length) return parsed;
  }

  const fenced = analysis.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/i);
  if (fenced) {
    const parsed = parseJsonCardArray(fenced[1]);
    if (parsed.length) return parsed;
  }

  const inline = analysis.match(/\[\s*\{\s*"name"\s*:/i);
  if (inline) {
    const start = analysis.indexOf("[", inline.index ?? 0);
    if (start >= 0) {
      const slice = analysis.slice(start);
      const end = slice.indexOf("]");
      if (end > 0) {
        const parsed = parseJsonCardArray(slice.slice(0, end + 1));
        if (parsed.length) return parsed;
      }
    }
  }

  return [];
}

function parseDetectedCardsFromLists(analysis: string): string[] {
  const lines = analysis.split(/\n/);
  const items: string[] = [];
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[\.)]\s+(.+)$/);
    const raw = (bullet?.[1] ?? numbered?.[1])?.trim();
    if (!raw) continue;
    if (/^(колода|расклад|карты)/i.test(raw)) continue;
    const cleaned = raw.replace(/[«»"']/g, "").trim();
    if (cleaned && !/^(не удалось|не распозн)/i.test(cleaned)) {
      items.push(cleaned);
    }
  }
  return items;
}

export function parseDetectedCards(analysis: string): string[] {
  const jsonCards = parseDetectedCardsJson(analysis);
  if (jsonCards.length) {
    return jsonCards.map((c) => (c.reversed ? `${c.name} (перев.)` : c.name));
  }

  const match = analysis.match(/^КАРТЫ:\s*([\s\S]+?)(?:\n\n|\nКОЛОДА:|\nРАСКЛАД:|$)/im);
  if (match) {
    const tokens = splitCardTokens(match[1]);
    if (tokens.length) return tokens;

    const fallback = match[1]
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+·\s+/)
      .map((s) => s.replace(/[«»"']/g, "").trim())
      .filter(Boolean);
    if (fallback.length) return fallback;
  }

  const listCards = parseDetectedCardsFromLists(analysis);
  if (listCards.length) return listCards;

  return [];
}

export function parsePhotoReadingResponse(analysis: string): PhotoReadingMetadata {
  return {
    deckType: parseMetadataLine(analysis, "КОЛОДА"),
    spreadType: parseMetadataLine(analysis, "РАСКЛАД"),
    detectedCards: parseDetectedCards(analysis),
  };
}

/** Убирает служебные строки КОЛОДА/РАСКЛАД/КАРТЫ из текста для показа пользователю. */
export function stripPhotoReadingHeader(analysis: string): string {
  return analysis
    .replace(/^КОЛОДА:.+\n\n?/im, "")
    .replace(/^РАСКЛАД:.+\n\n?/im, "")
    .replace(/^КАРТЫ_JSON:.+\n\n?/im, "")
    .replace(/^КАРТЫ:.+\n\n?/im, "")
    .trim();
}

export async function generatePhotoReading(
  systemPrompt: string,
  imageBase64: string,
  userText: string,
  mimeType?: string
): Promise<string | null> {
  const fullPrompt = await wrapSystemPrompt(systemPrompt);
  const messages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    buildPhotoVisionMessage(
      userText ||
        "Изучи фото: определи тип колоды и расклад, назови все видимые карты и дай расшифровку.",
      imageBase64,
      mimeType ?? "image/jpeg"
    ),
  ];

  return completeChat({
    messages,
    maxTokens: 1800,
    temperature: 0.65,
    vision: true,
  });
}

export function photoReadingFallback(userName?: string): string {
  const name = userName ?? "друг";
  return `${name}, связь с образом прервалась — не могу сейчас расшифровать расклад. Руны возвращены на баланс. Попробуйте ещё раз с более чётким фото: все карты целиком в кадре, без бликов, сверху. Или соберите расклад вручную в фото-режиме.`;
}

const PHOTO_RECOGNITION_ONLY = `
РЕЖИМ: ТОЛЬКО РАСПОЗНАВАНИЕ (без расшифровки).

Ты ОБЯЗАН распознать любой вид расклада на фото:
- классическое таро (Rider-Waite, Марсель, Тота, Shadow Work, Wild Unknown, Deviant Moon и любые авторские);
- Ленорман (36 карт), оракулы, метафорические и психологические колоды;
- руны, славянские символы, астрологические карты;
- скриншоты из приложений (Golden Thread, Labyrinthos, Facade, Tarot.com и др.);
- смешанные или неизвестные колоды — называй то, что видишь на картах.

Верни ТОЛЬКО служебные строки — без расшифровки и без обращения к клиенту:

КОЛОДА: [тип/название · уверенность: высокая/средняя/низкая]
РАСКЛАД: [название или описание · N символов · назначение если ясно]
КАРТЫ_JSON: [{"name":"Название с фото","reversed":false}, ...]
КАРТЫ: «Символ1» · «Символ2 (перев.)» · …

Правила КАРТЫ_JSON и КАРТЫ:
- Перечисли ВСЕ различимые символы на фото — не сокращай до 3, если видно больше.
- Порядок: слева направо / сверху вниз, как на фото.
- Если символов 1–2 — перечисли только видимые; клиент может добавить вручную.
- Перечисли символы слева направо / сверху вниз.
- Названия — в терминологии ЭТОЙ колоды на фото (English RWS: "Two of Swords", Ленорман: "Всадник", оракул: текст с карты).
- reversed: true если карта перевёрнута (перев.), иначе false.
- Для Rider-Waite / универсального таро можно дублировать русское «2 Мечей».
- НЕ отказывайся от распознавания из-за незнакомой колоды — опиши каждую видимую карту.
- КАРТЫ: не удалось распознать — ТОЛЬКО если на фото точно нет карт/рун/символов (портрет, пейзаж, пустой стол).
- Если видна хотя бы 1 карта — перечисли её; при сомнении укажи лучшее предположение и низкую уверенность в КОЛОДА.`;

export async function generatePhotoRecognition(
  systemPrompt: string,
  imageBase64: string,
  userText: string,
  mimeType?: string
): Promise<string | null> {
  const fullPrompt = await wrapSystemPrompt(`${systemPrompt}\n\n${PHOTO_RECOGNITION_ONLY}`);
  const messages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    buildPhotoVisionMessage(
      userText ||
        "Распознай колоду, схему расклада и все видимые символы. Только строки КОЛОДА/РАСКЛАД/КАРТЫ.",
      imageBase64,
      mimeType ?? "image/jpeg"
    ),
  ];

  return completeChat({
    messages,
    maxTokens: 1400,
    temperature: 0.35,
    vision: true,
    timeoutMs: 55_000,
    maxAttempts: 2,
    skipTemperatureRetry: true,
  });
}

export async function generatePhotoInterpretation(
  systemPrompt: string,
  spreadSummary: string,
  question?: string
): Promise<string | null> {
  const fullPrompt = await wrapSystemPrompt(systemPrompt);
  const questionLine = question?.trim()
    ? `Вопрос: «${question.trim()}»`
    : "";

  const userBlock = [
    spreadSummary,
    questionLine,
    "Дай персональную расшифровку.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    { role: "user", content: userBlock },
  ];

  const raw = await completeChat({
    messages,
    maxTokens: 1800,
    temperature: 0.65,
    vision: false,
  });

  if (!raw || isRejectedLlmOutput(raw)) {
    return null;
  }

  return raw;
}

export async function resolvePhotoReadingPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  referrerSlug?: string | null
): Promise<string> {
  return resolvePromptWithBuilder(buildPhotoReadingPrompt, characterId, ctx, referrerSlug);
}

export async function resolvePhotoInterpretationPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  referrerSlug?: string | null
): Promise<string> {
  return resolvePromptWithBuilder(buildPhotoInterpretationPrompt, characterId, ctx, referrerSlug);
}

async function resolvePromptWithBuilder(
  builder: (
    characterId: string,
    ctx: PhotoReadingContext,
    bloggerOverlay?: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null; knowledge?: string }
  ) => string,
  characterId: string,
  ctx: PhotoReadingContext,
  referrerSlug?: string | null
): Promise<string> {
  const prompt = builder(characterId, ctx);

  const humanSlug = !isAiMasterId(characterId) ? characterId : referrerSlug;
  if (!humanSlug) return prompt;

  try {
    const blogger = await getBloggerBySlug(humanSlug);
    if (!blogger) return prompt;

    const knowledge = await getBloggerKnowledge(blogger.id);
    return builder(characterId, ctx, { ...blogger, knowledge });
  } catch {
    return prompt;
  }
}
