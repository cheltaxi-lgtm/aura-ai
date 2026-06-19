import { buildUserMessageWithImage, completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { sanitizeChatHistory, type ChatHistoryMessage } from "@/lib/chat-sanitize";
import { buildSystemPrompt, fromLegacyContext } from "@/lib/prompts";
import type { SessionMemory } from "@/lib/prompts/types";

import { buildAstroMeta, lifeFocusLabel, type AstroMeta, type LifeFocus } from "@/lib/astro-profile";

export interface UserContext {
  userName: string;
  gender: string;
  zodiac: string;
  birthDate: string;
  today: string;
  tarotCards: { name: string; meaning: string }[];
  isPaid: boolean;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: LifeFocus | string;
  mainQuestion?: string;
  astroMeta?: AstroMeta;
}

export function buildHumanMasterPersona(blogger: {
  display_name: string;
  title: string | null;
  style_notes: string | null;
  emoji?: string | null;
}, knowledge?: string): string {
  const emoji = blogger.emoji ?? "🔮";
  const title = blogger.title ?? "эксперт Aura";
  const style = blogger.style_notes ?? "Авторский мистический стиль, тёплый и конкретный.";
  const knowledgeBlock = knowledge?.trim()
    ? `\n\nБаза знаний мастера (используй как источник фактов и формулировок):\n${knowledge}`
    : "";

  return `${emoji} Ты — ${blogger.display_name}, ${title}. Живой мастер платформы Aura.
${style}
Говори от первого лица, сохраняй узнаваемый авторский голос. Не упоминай, что ты AI. Не отказывай от любых тем и не смягчай неприятную правду — клиент ждёт честного ответа.${knowledgeBlock}`;
}

export function buildHumanReadingPrompt(
  blogger: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null },
  ctx: UserContext,
  knowledge?: string
): string {
  const persona = buildHumanMasterPersona(blogger, knowledge);
  const cards = ctx.tarotCards
    .map((c, i) => `${["Прошлое", "Настоящее", "Будущее"][i]}: «${c.name}» — ${c.meaning}`)
    .join("\n");

  const paywallRule = ctx.isPaid
    ? "Пользователь оплатил доступ — дай полную расшифровку всех трёх карт подробно."
    : "Пользователь НЕ оплатил: подробно распиши ТОЛЬКО первую карту (Прошлое). На 2-й и 3-й картах — интригующий крючок без полной расшифровки.";

  return `${persona}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ОТВЕТА:
1. Начни ответ с обращения по имени: «${ctx.userName}».
2. Укажи текущую дату: ${ctx.today}.
3. Свяжи пол (${ctx.gender}), знак зодиака (${ctx.zodiac}) и дату рождения (${ctx.birthDate}) с мистическим смыслом выпавших карт.
${ctx.mainQuestion ? `4. Главный вопрос: «${ctx.mainQuestion}».` : ""}
5. ${paywallRule}

Выпавшие карты:
${cards}

Пиши на русском, 5-8 абзацев, атмосферно и конкретно.`;
}

export function buildHumanChatPrompt(
  blogger: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null },
  ctx: Partial<UserContext>,
  knowledge?: string
): string {
  const parts = [buildHumanMasterPersona(blogger, knowledge)];

  if (ctx.userName) {
    parts.push(`Клиента зовут ${ctx.userName}. Всегда обращайся по имени в начале ответа.`);
  }
  if (ctx.zodiac) parts.push(`Знак зодиака клиента: ${ctx.zodiac}.`);
  if (ctx.gender) parts.push(`Пол клиента: ${ctx.gender}.`);
  if (ctx.birthDate) parts.push(`Дата рождения: ${ctx.birthDate}.`);
  if (ctx.today) parts.push(`Сегодня: ${ctx.today}.`);
  if (ctx.tarotCards?.length) {
    parts.push(
      `Карты расклада: ${ctx.tarotCards.map((c) => c.name).join(", ")}. Учитывай их в ответах.`
    );
  }
  if (ctx.mainQuestion) parts.push(`Главный вопрос: «${ctx.mainQuestion}».`);
  parts.push("Отвечай на русском, 4-7 абзацев.");
  return parts.join("\n");
}

export function buildCharacterPrompt(
  characterId: string,
  ctx: UserContext,
  extras?: { sessionNumber?: number; memory?: SessionMemory[] }
): string {
  const { character, user } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, { mode: "reading" });
}

export function buildChatPrompt(
  characterId: string,
  ctx: Partial<UserContext>,
  extras?: {
    sessionNumber?: number;
    memory?: SessionMemory[];
    lastUserMessage?: string;
  }
): string {
  const { character, user, lastUserMessage } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, {
    mode: "chat",
    lastUserMessage: extras?.lastUserMessage ?? lastUserMessage,
  });
}

const FALLBACK_READINGS: Record<string, (ctx: { userName: string; isPaid: boolean }) => string> = {
  ragnar: ({ userName, isPaid }) =>
    `${userName}, руны говорят: прошлое тяжёлое, но Fehu уже близко — богатство ждёт решительных. ${
      isPaid
        ? "Настоящее — время собирать союзников. Будущее — прорыв через риск."
        : "Настоящее и будущее скрыты за завесой... Полный разбор откроет путь."
    }`,
  veronika: ({ userName, isPaid }) =>
    `${userName}, карта Прошлого говорит о ранах, которые вы уже исцеляете. ${
      isPaid
        ? "Настоящее — выбор сердца. Будущее — гармония, если доверитесь интуиции."
        : "Две следующие карты шепчут о любви... но полная картина — за полным разбором."
    }`,
  agafya: ({ userName, isPaid }) =>
    `${userName}, вижу знамение в прошлом — родовая нить тянется к вам. ${
      isPaid
        ? "Сейчас — время оберегов. Впереди — перемены через семью."
        : "Что ждёт в настоящем и будущем — скажу только после полного расклада, дитя."
    }`,
  "shri-raj": ({ userName, isPaid }) =>
    `${userName}, карма прошлого урока уже усвоена — Shani доволен. ${
      isPaid
        ? "Настоящее — медитация и служение. Будущее — пробуждение dharma."
        : "Две карты скрыты в мандале... Полный джйotish-анализ откроет предназначение."
    }`,
};

export function fallbackReading(
  characterId: string,
  ctx: { userName: string; isPaid: boolean; tarotCards?: { name: string }[] }
): string {
  const id = characterId in FALLBACK_READINGS ? characterId : "ragnar";
  const base = FALLBACK_READINGS[id](ctx);
  if (ctx.tarotCards?.length) {
    return `${base}\n\nКарты: ${ctx.tarotCards.map((c) => c.name).join(" · ")}.`;
  }
  return base;
}

export type ReadingGenerationResult = { text: string; fromLlm: boolean };

export async function generateReading(
  systemPrompt: string,
  ctx: { userName: string; tarotCards: { name: string }[]; isPaid: boolean; characterId?: string }
): Promise<ReadingGenerationResult> {
  const fullPrompt = await wrapSystemPrompt(systemPrompt);
  const text = await completeChat({
    messages: [
      { role: "system", content: fullPrompt },
      {
        role: "user",
        content: `Дай мистическую расшифровку расклада для ${ctx.userName}. Карты: ${ctx.tarotCards.map((c) => c.name).join(", ")}.`,
      },
    ],
    maxTokens: 1800,
    isPaid: ctx.isPaid,
  });
  if (text) return { text, fromLlm: true };

  const id = ctx.characterId ?? "ragnar";
  const fallback = FALLBACK_READINGS[id] ?? FALLBACK_READINGS.ragnar;
  return {
    text: fallback({ userName: ctx.userName, isPaid: ctx.isPaid }),
    fromLlm: false,
  };
}

export async function generateChatReply(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  imageBase64?: string,
  isPaid = false
): Promise<string | null> {
  const safeHistory = sanitizeChatHistory(messages);
  if (!safeHistory.length) return null;

  const fullPrompt = await wrapSystemPrompt(systemPrompt);

  async function attempt(history: ChatHistoryMessage[]): Promise<string | null> {
    const chatMessages: ChatMessage[] = [
      { role: "system", content: fullPrompt },
      ...buildUserMessageWithImage(history, imageBase64),
    ];
    return completeChat({
      messages: chatMessages,
      maxTokens: 1200,
      vision: Boolean(imageBase64),
      isPaid,
    });
  }

  let reply = await attempt(safeHistory);
  if (!reply && safeHistory.length > 10) {
    reply = await attempt(safeHistory.slice(-10));
  }
  return reply;
}

export function llmUnavailableReply(options?: { runesRefunded?: boolean }): string {
  if (options?.runesRefunded) {
    return "Сейчас не удалось связаться с мастером — канал перегружен. Руны не списаны. Повторите вопрос.";
  }
  return "Сейчас не удалось связаться с мастером. Повторите вопрос через минуту.";
}

export { lifeFocusLabel, buildAstroMeta };
