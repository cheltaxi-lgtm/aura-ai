import { buildUserMessageWithImage, completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { sanitizeChatHistory, type ChatHistoryMessage } from "@/lib/chat-sanitize";
import {
  sanitizeReadingForClient,
  stripMemoryLeakFromReply,
  isDegenerateLlmOutput,
} from "@/lib/chat-reply-sanitize";
import { buildSystemPrompt, fromLegacyContext } from "@/lib/prompts";
import { GLOBAL_MASTER_RULES, LANGUAGE_STYLE_RULES, THEMATIC_SPREAD_READING_RULES, CARD_GROUNDED_READING_RULES, SPREAD_FINAL_CONCLUSION_RULES, RESPONSE_FORMAT } from "@/lib/prompts/format";
import { getSessionTopic } from "@/lib/session-topics";
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
  const title = blogger.title ?? "эксперт Zovus";
  const style = blogger.style_notes ?? "Авторский мистический стиль, тёплый и конкретный.";
  const knowledgeBlock = knowledge?.trim()
    ? `\n\nБаза знаний мастера (используй как источник фактов и формулировок):\n${knowledge.trim().slice(0, 10000)}`
    : "";

  return `${GLOBAL_MASTER_RULES}

${emoji} Ты — ${blogger.display_name}, ${title}. Живой мастер платформы Zovus.
${style}
Говори от первого лица, сохраняй узнаваемый авторский голос. Не упоминай, что ты AI. Не отказывай от любых тем и не смягчай неприятную правду — клиент ждёт честного ответа.
Если клиент спрашивает «ты ИИ?» или «ты робот?» — отвечай в образе:
«Я ${blogger.display_name}. Работаю здесь на платформе Zovus.
Если мои ответы помогают — значит это работает.»
Никогда не подтверждай и не отрицай — уходи в суть работы.${knowledgeBlock}${LANGUAGE_STYLE_RULES}`;
}

export function buildHumanReadingPrompt(
  blogger: { display_name: string; title: string | null; style_notes: string | null; emoji?: string | null },
  ctx: UserContext,
  knowledge?: string,
  intention?: string | null
): string {
  const persona = buildHumanMasterPersona(blogger, knowledge);
  const cards = ctx.tarotCards
    .map((c, i) => `${["Прошлое", "Настоящее", "Будущее"][i]}: «${c.name}» — ${c.meaning}`)
    .join("\n");

  const thematic = Boolean(intention?.trim() && intention !== "life_death");
  const topicLabel = thematic ? (getSessionTopic(intention!)?.label ?? intention) : null;

  const paywallRule = ctx.isPaid
    ? thematic
      ? `Клиент оплатил тематический расклад «${topicLabel}» — дай полную глубину по всем трём картам строго через эту тему.`
      : "Пользователь оплатил доступ — дай полную расшифровку всех трёх карт подробно."
    : "Пользователь НЕ оплатил: подробно распиши ТОЛЬКО первую карту (Прошлое). На 2-й и 3-й картах — интригующий крючок без полной расшифровки.";

  const lengthRule = thematic && ctx.isPaid
    ? `${THEMATIC_SPREAD_READING_RULES}\n\n${SPREAD_FINAL_CONCLUSION_RULES}`
    : ctx.isPaid
      ? `${RESPONSE_FORMAT}\n\n${SPREAD_FINAL_CONCLUSION_RULES}`
      : "7. От пяти до двенадцати предложений. Каждый вывод — только по символам ниже, с названием карты.";

  return `${persona}

${CARD_GROUNDED_READING_RULES}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ОТВЕТА:
1. Открытие — одно-два слова в стиле мастера, без «здравствуйте».
2. Обращайся по имени «${ctx.userName}» минимум дважды.
3. Укажи текущую дату: ${ctx.today}.
4. Пол, знак и дата рождения — только если усиливают чтение конкретного символа, не вместо карт.
${ctx.mainQuestion ? `5. Главный вопрос: «${ctx.mainQuestion}» — ответь через символы, не пересказывая вопрос.` : ""}
6. ${paywallRule}
${lengthRule}
8. Не утверждай факт (измена, болезнь, порча, крах), если его не поддерживает конкретный символ и его значение ниже.

Выпавшие карты (читай только эти значения, не подменяй своими):
${cards}

Пиши на русском, конкретно и по делу. Без markdown.`;
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
  parts.push("Отвечай на русском. От пяти до двенадцати предложений. Без markdown. Каждый вывод — только по символам расклада с названием карты и её значением из блока выше. Тема вопроса — линза, не источник фактов.");
  return parts.join("\n");
}

export function buildCharacterPrompt(
  characterId: string,
  ctx: UserContext,
  extras?: {
    sessionNumber?: number;
    memory?: SessionMemory[];
    intention?: string | null;
  }
): string {
  const { character, user } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, {
    mode: "reading",
    intention: extras?.intention ?? null,
  });
}

export function buildChatPrompt(
  characterId: string,
  ctx: Partial<UserContext>,
  extras?: {
    sessionNumber?: number;
    memory?: SessionMemory[];
    lastUserMessage?: string;
    intention?: string | null;
  }
): string {
  const { character, user, lastUserMessage } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, {
    mode: "chat",
    lastUserMessage: extras?.lastUserMessage ?? lastUserMessage,
    intention: extras?.intention,
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
  gadalka_marina: ({ userName, isPaid }) =>
    `${userName}, лунный свет на первой карте открывает то, что вы уже чувствуете сердцем. ${
      isPaid
        ? "Настоящее — момент выбора. Будущее — тихая ясность, если доверитесь интуиции."
        : "Две следующие карты хранят тайну... полный расклад откроет путь."
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

export function buildCardAwareFallbackReading(
  characterId: string,
  ctx: {
    userName: string;
    tarotCards: { name: string; meaning?: string }[];
    intention?: string | null;
    isPaid?: boolean;
  }
): string {
  const topicMeta = ctx.intention ? getSessionTopic(ctx.intention) : undefined;
  const topicLabel = topicMeta?.label ?? ctx.intention?.trim() ?? "расклад";
  const topicFocus = topicMeta?.focus ?? "ваша ситуация";

  const positions = [
    "Корень / Прошлое",
    "Сейчас / Настоящее",
    "Вектор / Ближайшие 1–3 месяца",
  ];

  const openers: Record<string, string> = {
    gadalka_marina: `${ctx.userName}, лунный свет лёг на символы — слушаю их для темы «${topicLabel}».`,
    veronika: `${ctx.userName}, карты открылись на «${topicLabel}» — вот что они говорят.`,
    ragnar: `${ctx.userName}, руны легли на «${topicLabel}» — смотрим правду без прикрас.`,
    agafya: `${ctx.userName}, дитя, вижу знамение на «${topicLabel}».`,
    "shri-raj": `${ctx.userName}, карма раскрыла «${topicLabel}» через эти символы.`,
  };
  const opener =
    openers[characterId in openers ? characterId : ""] ??
    `${ctx.userName}, символы раскрывают тему «${topicLabel}».`;

  const cardBlocks = ctx.tarotCards.slice(0, 3).map((card, i) => {
    const pos = positions[i] ?? `Позиция ${i + 1}`;
    const rawMeaning = card.meaning?.replace(/^[^:]+:\s*/, "").trim() ?? card.name;
    return `${pos} — «${card.name}». В контексте ${topicFocus} этот символ показывает: ${rawMeaning}. Для «${topicLabel}» это слой ${i === 0 ? "корня — откуда тянется ситуация" : i === 1 ? "настоящего — что происходит сейчас" : "вектора — куда движется линия в ближайшие месяцы"}. Опирайтесь на образ «${card.name}» как на конкретный ориентир, а не на догадки.`;
  });

  const names = ctx.tarotCards
    .slice(0, 3)
    .map((c) => c.name)
    .join(" → ");

  const recapParts = ctx.tarotCards.slice(0, 3).map((card, i) => {
    const raw = card.meaning?.replace(/^[^:]+:\s*/, "").trim() ?? card.name;
    const short = raw.split(/[.;]/)[0]?.trim() || raw;
    return `«${card.name}» (${positions[i]}) — ${short}`;
  });

  const midCard = ctx.tarotCards[1]?.name ?? ctx.tarotCards[0]?.name;
  const rootCard = ctx.tarotCards[0]?.name ?? "первая карта";
  const vectorCard = ctx.tarotCards[2]?.name ?? "третья карта";

  const finalBlock = [
    `${ctx.userName}, вывод по всему раскладу на тему «${topicLabel}».`,
    `Линия ${names}: ${recapParts.join("; ")}.`,
    `Вместе символы складываются в одну картину — корень «${rootCard}» объясняет откуда тянется ситуация, «${midCard}» показывает точку опоры сейчас, «${vectorCard}» задаёт вектор на ближайшие месяцы.`,
    `По теме «${topicLabel}» главный факт: опирайтесь на то, что уже видно в «${midCard}», а не на ожидание идеальных условий.`,
    `Сделайте: один конкретный шаг из логики «${vectorCard}» — без откладывания.`,
    `Не делайте: не игнорируйте корень «${rootCard}» — он объясняет, почему тема «${topicLabel}» сейчас именно такая.`,
  ].join(" ");

  return [opener, ...cardBlocks, finalBlock].join("\n\n");
}

export function fallbackReading(
  characterId: string,
  ctx: { userName: string; isPaid: boolean; tarotCards?: { name: string; meaning?: string }[]; intention?: string | null }
): string {
  if (ctx.tarotCards?.length) {
    return buildCardAwareFallbackReading(characterId, {
      userName: ctx.userName,
      tarotCards: ctx.tarotCards,
      intention: ctx.intention,
      isPaid: ctx.isPaid,
    });
  }
  const id = characterId in FALLBACK_READINGS ? characterId : "ragnar";
  return FALLBACK_READINGS[id](ctx);
}

export type ReadingGenerationResult = { text: string; fromLlm: boolean };

export async function generateReading(
  systemPrompt: string,
  ctx: {
    userName: string;
    tarotCards: { name: string; meaning?: string }[];
    isPaid: boolean;
    characterId?: string;
    intention?: string | null;
    userMessage?: string;
  }
): Promise<ReadingGenerationResult> {
  const fullPrompt = await wrapSystemPrompt(systemPrompt);
  const thematic = Boolean(ctx.intention?.trim() && ctx.intention !== "life_death");
  const topicMeta = thematic ? getSessionTopic(ctx.intention!) : undefined;
  const topicLabel = topicMeta?.label ?? ctx.intention?.trim();

  const positions = ["Корень / Прошлое", "Сейчас / Настоящее", "Вектор / Ближайшие 1–3 месяца"];
  const cardsDetailed = ctx.tarotCards
    .slice(0, 3)
    .map((c, i) => {
      const pos = positions[i] ?? `Позиция ${i + 1}`;
      const raw = c.meaning?.replace(/^[^:]+:\s*/, "").trim();
      return raw ? `${pos}: «${c.name}» — ${raw}` : `${pos}: «${c.name}»`;
    })
    .join("; ");

  const userContent =
    ctx.userMessage?.trim() ||
    (thematic
      ? `Расшифруй оплаченный расклад для ${ctx.userName}. Тема «${topicLabel}» — только линза. Символы: ${cardsDetailed}. В конце — финальный блок выводов по всему раскладу с действиями.`
      : `Расшифруй расклад для ${ctx.userName}. Символы: ${cardsDetailed}. В конце — финальный блок выводов по всему раскладу с действиями.`);

  const cardNames = ctx.tarotCards.map((c) => c.name);

  const acceptReading = (raw: string | null): string | null => {
    if (!raw?.trim()) return null;
    const cleaned = sanitizeReadingForClient(raw, cardNames);
    if (cleaned.length >= 400) return cleaned;
    const stripped = stripMemoryLeakFromReply(raw);
    if (stripped.length >= 400 && !isDegenerateLlmOutput(stripped)) return stripped;
    return null;
  };

  const baseMessages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    { role: "user", content: userContent },
  ];

  const attemptPlans: Array<{
    messages: ChatMessage[];
    maxTokens: number;
    timeoutMs: number;
    maxAttempts: number;
    temperature?: number;
  }> = thematic
    ? [
        { messages: baseMessages, maxTokens: 2800, timeoutMs: 45000, maxAttempts: 2, temperature: 0.85 },
        {
          messages: baseMessages,
          maxTokens: 2000,
          timeoutMs: 35000,
          maxAttempts: 1,
          temperature: 0.85,
        },
      ]
    : [{ messages: baseMessages, maxTokens: 2000, timeoutMs: 45000, maxAttempts: 2, temperature: 0.85 }];

  for (const plan of attemptPlans) {
    const text = await completeChat({
      messages: plan.messages,
      maxTokens: plan.maxTokens,
      timeoutMs: plan.timeoutMs,
      maxAttempts: plan.maxAttempts,
      temperature: plan.temperature,
      isPaid: ctx.isPaid,
    });
    const accepted = acceptReading(text);
    if (accepted) return { text: accepted, fromLlm: true };
  }

  const id = ctx.characterId ?? "ragnar";
  return {
    text: buildCardAwareFallbackReading(id, ctx),
    fromLlm: false,
  };
}

export async function generateChatReply(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  imageBase64?: string,
  isPaid = false,
  temperature?: number
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
      temperature,
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
