import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { todayLabelRu } from "@/lib/prompt-date";
import { buildChatPrompt, buildHumanChatPrompt } from "@/lib/chat-prompts";
import type { UserContext } from "@/lib/chat-prompts";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { isAiMasterId } from "@/lib/showcase-masters";
import {
  MAX_PHOTO_CARDS,
  normalizeCardConfidence,
  type PhotoRecognitionConfidence,
} from "@/lib/photo-reading-constants";

export interface PhotoReadingContext extends Partial<UserContext> {
  question?: string;
}

export interface PhotoReadingMetadata {
  deckType?: string;
  spreadType?: string;
  detectedCards: string[];
  /** Per-card confidence, index-aligned with detectedCards. Defaults to "unknown" when the model didn't provide structured JSON. */
  cardConfidences: PhotoRecognitionConfidence[];
}

import { MAX_SPREAD_CARD_COUNT } from "@/lib/spreads";
import { spreadFinalConclusionRules } from "@/lib/prompts/format";

/** Rules for the SECOND step: cards already confirmed in the Zovus deck, no recognition needed. */
const PHOTO_INTERPRETATION_RULES = `
РЕЖИМ: РАСШИФРОВКА ПОДТВЕРЖДЁННОГО РАСКЛАДА.
Карты уже распознаны и подтверждены клиентом — НЕ определяй колоду заново, НЕ выводи служебные строки (КОЛОДА/РАСКЛАД/КАРТЫ), НЕ перечисляй карты списком с номерами.

Дай персональную расшифровку от лица мастера, 4–8 абзацев на русском живым текстом:
- по каждой карте: название → значение в её позиции расклада → вывод для клиента;
- обращай внимание не только на отдельные карты, но и на комбинации соседних и повторяющихся карт (масти, числа, стихии, конфликтующие или усиливающие друг друга образы) — если видна значимая связка, отдельно назови её и что она добавляет к смыслу расклада;
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

/** Lean persona-only base for the recognition pass — no interpretation rules, PHOTO_RECOGNITION_ONLY carries the actual instructions. */
export function buildPhotoRecognitionPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null; knowledge?: string }
): string {
  const base = buildPersonaBase(characterId, ctx, bloggerOverlay);
  return `${base}

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
  confidence: PhotoRecognitionConfidence;
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
    const arr = JSON.parse(raw) as Array<{ name?: string; reversed?: boolean; confidence?: string }>;
    if (!Array.isArray(arr)) return [];
    return arr
      .slice(0, MAX_PHOTO_CARDS)
      .map((item) => ({
        name: String(item.name ?? "").trim(),
        reversed: Boolean(item.reversed),
        confidence: normalizeCardConfidence(item.confidence),
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

/** Per-card confidence, index-aligned with parseDetectedCards() when КАРТЫ_JSON was provided; empty otherwise. */
function parseDetectedCardConfidences(analysis: string): PhotoRecognitionConfidence[] {
  return parseDetectedCardsJson(analysis).map((entry) => entry.confidence);
}

export function parsePhotoReadingResponse(analysis: string): PhotoReadingMetadata {
  const detectedCards = parseDetectedCards(analysis);
  const rawConfidences = parseDetectedCardConfidences(analysis);
  const cardConfidences = detectedCards.map((_, i) => rawConfidences[i] ?? "unknown");
  return {
    deckType: parseMetadataLine(analysis, "КОЛОДА"),
    spreadType: parseMetadataLine(analysis, "РАСКЛАД"),
    detectedCards,
    cardConfidences,
  };
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
КАРТЫ_JSON: [{"name":"Название с фото","reversed":false,"confidence":"высокая"}, ...]
КАРТЫ: «Символ1» · «Символ2 (перев.)» · …

Правила КАРТЫ_JSON и КАРТЫ:
- Перечисли ВСЕ различимые символы на фото слева направо / сверху вниз, как они лежат на фото.
- Максимум 12 символов — если на фото больше, перечисли 12 самых различимых, остальные клиент добавит вручную.
- Если символов 1–2 — перечисли только видимые; клиент может добавить вручную.
- Названия — в терминологии ЭТОЙ колоды на фото (English RWS: "Two of Swords", Ленорман: "Всадник", оракул: текст с карты).
- reversed: true если карта перевёрнута (перев.), иначе false.
- confidence — твоя уверенность именно в ЭТОЙ карте (не в колоде целиком): "высокая" если название читается чётко, "средняя" при частичном перекрытии/блике, "низкая" при угадывании по обрывку образа.
- Для Rider-Waite / универсального таро можно дублировать русское «2 Мечей».
- НЕ отказывайся от распознавания из-за незнакомой колоды — опиши каждую видимую карту.
- КАРТЫ: не удалось распознать — ТОЛЬКО если на фото точно нет карт/рун/символов (портрет, пейзаж, пустой стол).
- Если видна хотя бы 1 карта — перечисли её; при сомнении укажи лучшее предположение и низкую уверенность и в КОЛОДА, и в confidence этой карты.`;

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

export async function resolvePhotoRecognitionPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  referrerSlug?: string | null
): Promise<string> {
  return resolvePromptWithBuilder(buildPhotoRecognitionPrompt, characterId, ctx, referrerSlug);
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
