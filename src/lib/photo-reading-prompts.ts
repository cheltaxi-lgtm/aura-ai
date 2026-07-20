import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { todayLabelRu } from "@/lib/prompt-date";
import {
  buildCharacterPrompt,
  buildChatPrompt,
  buildHumanChatPrompt,
  buildHumanReadingPrompt,
  type UserContext,
} from "@/lib/chat-prompts";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { isAiMasterId } from "@/lib/showcase-masters";
import { formatReversedCardName, parseCardOrientation } from "@/lib/card-orientation";
import {
  MAX_PHOTO_CARDS,
  normalizeCardConfidence,
  type PhotoRecognitionConfidence,
} from "@/lib/photo-reading-constants";
import { buildPaidSpreadReadingExtras } from "@/lib/prompts/premium-reading";

export interface PhotoReadingContext extends Partial<UserContext> {
  question?: string;
}

export interface PhotoReadingParseOptions {
  /** Landscape camera frame — common source of false reversed flags on multi-card rows. */
  landscapePhoto?: boolean;
  /**
   * Wide/square frame or unknown dims with a multi-card row — still triggers the
   * classic “half the cards marked reversed” vision bug.
   */
  horizontalRowSuspect?: boolean;
}

export interface PhotoReadingMetadata {
  deckType?: string;
  spreadType?: string;
  detectedCards: string[];
  /** Per-card confidence, index-aligned with detectedCards. Defaults to "unknown" when the model didn't provide structured JSON. */
  cardConfidences: PhotoRecognitionConfidence[];
}

/** Extra photo-only rules layered on top of full reading-mode persona. */
function photoInterpretationRules(cardCount: number, masterId: string): string {
  const n = Math.max(1, cardCount);

  return `
РЕЖИМ: РАСШИФРОВКА ПОДТВЕРЖДЁННОГО ФОТО-РАСКЛАДА.
Карты уже распознаны и подтверждены клиентом — НЕ определяй колоду заново, НЕ выводи служебные строки (КОЛОДА/РАСКЛАД/КАРТЫ), НЕ перечисляй карты списком с номерами.

${buildPaidSpreadReadingExtras({ cardCount: n, masterId })}

ДОПОЛНИТЕЛЬНО ДЛЯ ФОТО-РАСКЛАДА:
- по каждой карте: название → значение в её позиции → вывод для клиента (отдельный развёрнутый абзац);
- если карт больше одной — отдельно назови значимые связки соседних и повторяющихся карт (масти, числа, стихии, конфликт или усиление) и что они добавляют к смыслу;
- свяжи с вопросом клиента и астрологическим профилем (если есть);
- оставайся в образе; на прямой вопрос «ты ИИ?» — честно, в образе мастера.`;
}

function photoReadingExtras(ctx: PhotoReadingContext) {
  const cards = ctx.tarotCards ?? [];
  const positionLabels = cards.map((c, i) => {
    const pos = (c as { position?: string }).position?.trim();
    return pos || `Позиция ${i + 1}`;
  });
  const question = ctx.question?.trim() || ctx.mainQuestion?.trim() || undefined;

  return {
    spreadType: "photo" as const,
    positionLabels,
    forceThematicReading: true,
    lastUserMessage: question,
    customQuestion: question ?? null,
  };
}

function buildPersonaBase(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: {
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
    knowledge?: string;
    slug?: string;
  }
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

function buildInterpretationPersonaBase(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: {
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
    knowledge?: string;
    slug?: string;
  }
): string {
  const extras = photoReadingExtras(ctx);
  const readingCtx: UserContext = {
    userName: ctx.userName ?? "друг",
    gender: ctx.gender ?? "",
    zodiac: ctx.zodiac ?? "",
    birthDate: ctx.birthDate ?? "",
    today: ctx.today ?? todayLabelRu(),
    tarotCards: (ctx.tarotCards ?? []).map((c) => ({
      name: c.name,
      meaning: c.meaning ?? "",
    })),
    isPaid: Boolean(ctx.isPaid),
    birthTime: ctx.birthTime,
    birthCity: ctx.birthCity,
    lifeFocus: ctx.lifeFocus,
    mainQuestion: ctx.question?.trim() || ctx.mainQuestion,
    astroMeta: ctx.astroMeta,
  };

  if (bloggerOverlay && !isAiMasterId(characterId)) {
    return buildHumanReadingPrompt(
      bloggerOverlay,
      readingCtx,
      bloggerOverlay.knowledge,
      extras.customQuestion,
      {
        positionLabels: extras.positionLabels,
        forceThematicReading: true,
      }
    );
  }

  let base = buildCharacterPrompt(characterId, readingCtx, extras);

  if (bloggerOverlay && isAiMasterId(characterId)) {
    base += `\n\nСтиль мастера ${bloggerOverlay.display_name}: ${bloggerOverlay.style_notes ?? ""}`;
    if (bloggerOverlay.knowledge) {
      base += `\nБаза знаний:\n${bloggerOverlay.knowledge}`;
    }
  }

  return base;
}

/** Lean persona-only base for the recognition pass — no interpretation rules, PHOTO_RECOGNITION_ONLY carries the actual instructions. */
export function buildPhotoRecognitionPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: {
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
    knowledge?: string;
  }
): string {
  const base = buildPersonaBase(characterId, ctx, bloggerOverlay);
  return `${base}

Сегодня: ${ctx.today ?? todayLabelRu()}.`;
}

export function buildPhotoInterpretationPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  bloggerOverlay?: {
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
    knowledge?: string;
  }
): string {
  const cardCount = Math.max(1, ctx.tarotCards?.length ?? 1);
  const base = buildInterpretationPersonaBase(characterId, ctx, bloggerOverlay);

  return `${base}

${photoInterpretationRules(cardCount, characterId)}

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

/**
 * Corrects false reversed flags from horizontal / multi-card-row photos.
 * Vision models often treat phone landscape (or a sideways EXIF frame) as
 * "every other card is upside-down" even when all cards are upright on the table.
 * The UI already lets the user toggle reversed manually — prefer upright default.
 */
export function sanitizeLandscapeReversedGuesses(
  cards: DetectedCardEntry[],
  opts?: PhotoReadingParseOptions
): DetectedCardEntry[] {
  const reversedCount = cards.filter((card) => card.reversed).length;
  if (reversedCount === 0 || cards.length < 1) return cards;

  const landscape = Boolean(opts?.landscapePhoto);
  const rowSuspect = Boolean(opts?.horizontalRowSuspect) || landscape;

  // Horizontal frame: never trust model reversed — clear all.
  if (landscape) {
    return cards.map((card) => ({ ...card, reversed: false }));
  }

  if (cards.length < 2) return cards;

  // Need ≥3 cards — on a pair, "second reversed" is a valid reading, not a checkerboard artifact.
  const alternating =
    cards.length >= 3 &&
    (cards.every((card, index) => card.reversed === (index % 2 === 0)) ||
      cards.every((card, index) => card.reversed === (index % 2 === 1)));
  const partialMix = reversedCount >= 1 && reversedCount < cards.length;

  // Patterned / partial reverses on a multi-card row are almost always artifacts.
  // Keep unanimous reverses on upright portrait photos (user may have flipped the whole pack).
  const shouldClear =
    alternating ||
    (rowSuspect && partialMix) ||
    (rowSuspect && cards.length >= 3 && reversedCount >= 1) ||
    (cards.length >= 3 && partialMix);

  if (!shouldClear) return cards;

  return cards.map((card) => ({ ...card, reversed: false }));
}

function parseDetectedCardEntries(
  analysis: string,
  opts?: PhotoReadingParseOptions
): DetectedCardEntry[] {
  const jsonCards = sanitizeLandscapeReversedGuesses(parseDetectedCardsJson(analysis), opts);
  if (jsonCards.length) return jsonCards;

  const match = analysis.match(/^КАРТЫ:\s*([\s\S]+?)(?:\n\n|\nКОЛОДА:|\nРАСКЛАД:|$)/im);
  if (match) {
    const tokens = splitCardTokens(match[1]);
    if (tokens.length) {
      return sanitizeLandscapeReversedGuesses(
        tokens.map((token) => {
          const { name, reversed } = parseCardOrientation(token);
          return { name, reversed, confidence: "unknown" as const };
        }),
        opts
      );
    }
  }

  const listCards = parseDetectedCardsFromLists(analysis);
  if (listCards.length) {
    return sanitizeLandscapeReversedGuesses(
      listCards.map((token) => {
        const { name, reversed } = parseCardOrientation(token);
        return { name, reversed, confidence: "unknown" as const };
      }),
      opts
    );
  }

  return [];
}

export function parseDetectedCards(analysis: string, opts?: PhotoReadingParseOptions): string[] {
  return parseDetectedCardEntries(analysis, opts).map((card) =>
    formatReversedCardName(card.name, card.reversed)
  );
}

export function parsePhotoReadingResponse(
  analysis: string,
  opts?: PhotoReadingParseOptions
): PhotoReadingMetadata {
  const entries = parseDetectedCardEntries(analysis, opts);
  const detectedCards = entries.map((card) => formatReversedCardName(card.name, card.reversed));
  const cardConfidences = entries.map((entry) => entry.confidence);
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
- Ориентация и reversed (критично — частая ошибка на горизонтальных фото):
  - Сначала для КАЖДОЙ карты отдельно определи её ориентацию по собственным визуальным признакам: положение номера, названия, символов и изображения относительно рамки самой карты.
  - НЕ суди о перевёрнутости относительно рамки всего фото, экрана, телефона или горизонтального кадра — только относительно границ конкретной карты.
  - Фото часто снимают горизонтально, когда в кадре много карт в один ряд. Это НЕ делает карты перевёрнутыми. Мысленно поверни кадр так, чтобы ряд стал привычным горизонтальным рядом обычных вертикальных карт (длинная сторона каждой карты вертикальна), и только после этого определяй reversed.
  - Типичная ошибка: карты лежат прямо, но из-за горизонтального фото модель помечает часть карт как reversed. Так делать нельзя.
  - reversed: true только если внутри рамки карты изображение/текст перевёрнуты на 180° относительно нормального положения этой колоды; иначе false.
  - При сомнении в reversed всегда ставь false — клиент поправит вручную. Ложный reversed хуже, чем пропущенный реальный переворот.
- confidence — твоя уверенность именно в ЭТОЙ карте (не в колоде целиком): "высокая" если название читается чётко, "средняя" при частичном перекрытии/блике, "низкая" при угадывании по обрывку образа.
- Для Rider-Waite / универсального таро можно дублировать русское «2 Мечей».
- НЕ отказывайся от распознавания из-за незнакомой колоды — опиши каждую видимую карту.
- КАРТЫ: не удалось распознать — ТОЛЬКО если на фото точно нет карт/рун/символов (портрет, пейзаж, пустой стол).
- Если видна хотя бы 1 карта — перечисли её; при сомнении укажи лучшее предположение и низкую уверенность и в КОЛОДА, и в confidence этой карты.`;

const PHOTO_RECOGNITION_USER_HINT =
  "Важно: фото может быть горизонтальным, особенно если карт много в ряд. Ориентацию reversed определяй только по рамке каждой карты, не по рамке всего фото. При сомнении reversed=false.";

const PHOTO_RECOGNITION_LANDSCAPE_FORCE_UPRIGHT =
  "КРИТИЧНО: это горизонтальное фото (кадр шире высоты, карты обычно в один ряд). Поставь reversed:false для КАЖДОЙ карты в КАРТЫ_JSON и не пиши «(перев.)» в КАРТЫ. Клиент поправит переворот вручную при необходимости.";

export async function generatePhotoRecognition(
  systemPrompt: string,
  imageBase64: string,
  userText: string,
  mimeType?: string,
  opts?: { landscapePhoto?: boolean }
): Promise<string | null> {
  const fullPrompt = await wrapSystemPrompt(`${systemPrompt}\n\n${PHOTO_RECOGNITION_ONLY}`);
  const hints = [
    PHOTO_RECOGNITION_USER_HINT,
    opts?.landscapePhoto ? PHOTO_RECOGNITION_LANDSCAPE_FORCE_UPRIGHT : "",
  ]
    .filter(Boolean)
    .join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    buildPhotoVisionMessage(
      userText
        ? `${userText}\n\n${hints}`
        : `Распознай колоду, схему расклада и все видимые символы. Только строки КОЛОДА/РАСКЛАД/КАРТЫ.\n\n${hints}`,
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
    bloggerOverlay?: {
      display_name: string;
      title: string | null;
      style_notes: string | null;
      emoji?: string | null;
      knowledge?: string;
    }
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

export { paidSpreadMaxTokens as photoInterpretationMaxTokens } from "@/lib/prompts/premium-reading";
