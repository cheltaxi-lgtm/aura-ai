import { completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
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
- Называй карты в терминологии ЭТОЙ колоды (RWS: «6 Мечей», Тота: «Уравновешивание (Adjustment)», Марсель: «Отшельник»).
- Перевёрнутые — «(перев.)».
- Разбери все различимые карты (1–20+), не выдумывай скрытые или размытые.
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
- не упоминай, что ты AI или vision-модель;
- применяй политику честности: не смягчай негатив, не отказывай от «тёмных» тем, если они видны в раскладе или в вопросе.`;

export function buildPhotoReadingPrompt(
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
    base = buildHumanChatPrompt(
      bloggerOverlay,
      ctx,
      bloggerOverlay.knowledge
    );
  }

  const questionLine = ctx.question?.trim()
    ? `Вопрос клиента к этому раскладу: «${ctx.question.trim()}».`
    : "Клиент не задал отдельный вопрос — определи назначение расклада по схеме и дай общую расшифровку.";

  return `${base}

${PHOTO_READING_RULES}

${questionLine}
Сегодня: ${ctx.today ?? new Date().toLocaleDateString("ru-RU")}.`;
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

export function parseDetectedCards(analysis: string): string[] {
  const match = analysis.match(/^КАРТЫ:\s*(.+)$/im);
  if (!match) return [];
  return match[1]
    .split(/[·•|/]/)
    .map((s) => s.replace(/[«»"']/g, "").trim())
    .filter(Boolean);
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
  return `КОЛОДА: не определена
РАСКЛАД: не распознан
КАРТЫ: не удалось распознать

${name}, связь с образом прервалась — не могу чётко разобрать карты на фото. Сделайте снимок при хорошем свете: все карты целиком в кадре, без бликов, сверху. Подойдут любые колоды — таро, Ленорман, оракулы, скриншот из приложения. Или опишите расклад текстом в чате с мастером.`;
}

export async function resolvePhotoReadingPrompt(
  characterId: string,
  ctx: PhotoReadingContext,
  referrerSlug?: string | null
): Promise<string> {
  let prompt = buildPhotoReadingPrompt(characterId, ctx);

  const humanSlug = !isAiMasterId(characterId) ? characterId : referrerSlug;
  if (!humanSlug) return prompt;

  try {
    const blogger = await getBloggerBySlug(humanSlug);
    if (!blogger) return prompt;

    const knowledge = await getBloggerKnowledge(blogger.id);
    return buildPhotoReadingPrompt(characterId, ctx, {
      ...blogger,
      knowledge,
    });
  } catch {
    return prompt;
  }
}
