import { buildUserMessageWithImage, completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { completeProseWithContinuation } from "@/lib/prose-completion";
import { isProseLikelyTruncated } from "@/lib/prose-truncation";
import {
  ensurePaidSpreadTextComplete,
  isPaidSpreadTextComplete,
} from "@/lib/spread-reading-complete";
import { sanitizeChatHistory, LLM_CONTEXT_MESSAGES, type ChatHistoryMessage } from "@/lib/chat-sanitize";
import {
  sanitizeReadingForClient,
  stripMemoryLeakFromReply,
  isDegenerateLlmOutput,
  stripTheaterFromReply,
} from "@/lib/chat-reply-sanitize";
import { buildSystemPrompt, fromLegacyContext } from "@/lib/prompts";
import { GLOBAL_MASTER_RULES, LANGUAGE_STYLE_RULES, THEMATIC_SPREAD_READING_RULES, CARD_GROUNDED_READING_RULES, spreadFinalConclusionRules, responseFormatForSpread, thematicSpreadReadingRules } from "@/lib/prompts/format";
import {
  isTarotRuneMasterId,
  TAROT_RUNE_THEATER_BAN,
  TAROT_RUNE_MARKDOWN_FORMAT,
  TAROT_RUNE_CHAT_FORMAT,
  tarotRuneThematicReadingRules,
} from "@/lib/prompts/tarot-rune-format";
import { MARINA_PERSONA } from "@/lib/prompts/masters/marina";
import { getSessionTopic } from "@/lib/session-topics";
import { buildNumerologSpreadReading } from "@/lib/numerolog/welcome";
import type { SessionMemory } from "@/lib/prompts/types";
import { getSpread, normalizeSpreadId, requiredCardCount, resolveSpreadPositions } from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";

import { buildAstroMeta, lifeFocusLabel, type AstroMeta, type LifeFocus } from "@/lib/astro-profile";
import {
  buildClientGenderInstruction,
  resolveClientGender,
} from "@/lib/russian-name-gender";

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

export function buildHumanMasterPersona(
  blogger: {
    slug?: string;
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
  },
  knowledge?: string
): string {
  const emoji = blogger.emoji ?? "🔮";
  const title = blogger.title ?? "эксперт Zovus";
  const style = blogger.style_notes ?? "Авторский мистический стиль, тёплый и конкретный.";
  const knowledgeBlock = knowledge?.trim()
    ? `\n\nБаза знаний мастера (используй как источник фактов и формулировок):\n${knowledge.trim().slice(0, 10000)}`
    : "";

  const marinaBlock = blogger.slug === "gadalka_marina" ? `\n\n${MARINA_PERSONA}` : "";
  const tarotRuneBlock = isTarotRuneMasterId(blogger.slug ?? "") ? `\n${TAROT_RUNE_THEATER_BAN}` : "";

  return `${GLOBAL_MASTER_RULES}
${tarotRuneBlock}
${marinaBlock}

${emoji} Ты — ${blogger.display_name}, ${title}. ИИ-наставник Zovus в образе этого наставника${knowledge ? " (с материалами эксперта)" : ""}.
${style}
Говори от первого лица, сохраняй узнаваемый авторский голос и эмоциональную силу. Отвечай символически по раскладу, без фактических приговоров о здоровье и судьбе.
Если клиент спрашивает «ты ИИ?» или «ты робот?» — честно, в образе:
«Да, я ИИ-наставник Zovus в образе ${blogger.display_name}. Если мои слова попадают в точку — значит, канал работает.»
Не выдавай себя за конкретного живого человека и не скрывай природу при прямом вопросе.${knowledgeBlock}${LANGUAGE_STYLE_RULES}`;
}

export function buildHumanReadingPrompt(
  blogger: {
    slug?: string;
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
  },
  ctx: UserContext,
  knowledge?: string,
  intention?: string | null,
  options?: {
    spreadId?: string | null;
    positionLabels?: string[];
    forceThematicReading?: boolean;
  }
): string {
  const persona = buildHumanMasterPersona(blogger, knowledge);
  const tarotRune = isTarotRuneMasterId(blogger.slug ?? "");
  const spreadId = normalizeSpreadId(options?.spreadId);
  const spread = getSpread(spreadId);
  const positions =
    options?.positionLabels ??
    resolveSpreadPositions(spreadId, intention as SessionTopicId | null | undefined).map(
      (p) => p.label
    );
  const cardCount = options?.positionLabels?.length
    ? Math.min(ctx.tarotCards.length, options.positionLabels.length)
    : Math.min(ctx.tarotCards.length, spread.cardCount);
  const cardsSlice = ctx.tarotCards.slice(0, Math.max(1, cardCount));
  const cards = cardsSlice
    .map((c, i) => `${positions[i] ?? `Позиция ${i + 1}`}: «${c.name}» — ${c.meaning}`)
    .join("\n");

  const thematic =
    Boolean(options?.forceThematicReading) ||
    Boolean(intention?.trim() && intention !== "life_death");
  const topicLabel = thematic
    ? intention && intention !== "life_death"
      ? (getSessionTopic(intention)?.label ?? intention)
      : "фото-расклад"
    : null;
  const n = cardsSlice.length || 1;
  const cardWord = n === 1 ? "карту" : `${n} символов`;

  const paywallRule = ctx.isPaid
    ? thematic
      ? `Клиент оплатил тематический расклад «${topicLabel}» — дай полную глубину по всем ${cardWord} строго через эту тему.`
      : `Пользователь оплатил доступ — дай полную расшифровку всех ${cardWord} подробно.`
    : n <= 1
      ? "Пользователь НЕ оплатил: дай интригующий крючок без полной расшифровки."
      : `Пользователь НЕ оплатил: подробно распиши ТОЛЬКО первый символ. По остальным ${n - 1} — интригующий крючок без полной расшифровки.`;

  const lengthRule = tarotRune
    ? thematic && ctx.isPaid
      ? tarotRuneThematicReadingRules(n)
      : TAROT_RUNE_MARKDOWN_FORMAT
    : thematic && ctx.isPaid
      ? `${thematicSpreadReadingRules(n)}\n\n${spreadFinalConclusionRules(n)}`
      : ctx.isPaid
        ? `${responseFormatForSpread(n)}\n\n${spreadFinalConclusionRules(n)}`
        : "7. От пяти до двенадцати предложений. Каждый вывод — только по символам ниже, с названием карты.";

  const formatTail = tarotRune
    ? "Пиши на русском, конкретно и по делу. Только русский — без английских вставок (guarded, hidden, safe и т.п.). Используй Markdown по правилам выше."
    : "Пиши на русском, конкретно и по делу. Только русский — без английских вставок. Без markdown.";

  const firstName = (ctx.userName ?? "").trim().split(/\s+/)[0] || "друг";
  const genderBlock = buildClientGenderInstruction({
    gender: resolveClientGender(ctx.gender, firstName),
    firstName,
  });

  return `${persona}

${CARD_GROUNDED_READING_RULES}

${genderBlock}

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

${formatTail}`;
}

export function buildHumanChatPrompt(
  blogger: {
    slug?: string;
    display_name: string;
    title: string | null;
    style_notes: string | null;
    emoji?: string | null;
  },
  ctx: Partial<UserContext>,
  knowledge?: string
): string {
  const parts = [buildHumanMasterPersona(blogger, knowledge), CARD_GROUNDED_READING_RULES];
  const tarotRune = isTarotRuneMasterId(blogger.slug ?? "");

  if (ctx.userName) {
    parts.push(`Клиента зовут ${ctx.userName}. Всегда обращайся по имени в начале ответа.`);
  }
  if (ctx.zodiac) parts.push(`Знак зодиака клиента: ${ctx.zodiac}.`);
  {
    const firstName = (ctx.userName ?? "").trim().split(/\s+/)[0] || "друг";
    parts.push(
      buildClientGenderInstruction({
        gender: resolveClientGender(ctx.gender, firstName),
        firstName,
      })
    );
  }
  if (ctx.birthDate) parts.push(`Дата рождения: ${ctx.birthDate}.`);
  if (ctx.today) parts.push(`Сегодня: ${ctx.today}.`);
  if (ctx.tarotCards?.length) {
    const cardLines = ctx.tarotCards
      .map((c, i) => {
        const meaning = c.meaning?.trim() ? ` — ${c.meaning.trim()}` : "";
        return `${i + 1}. «${c.name}»${meaning}`;
      })
      .join("\n");
    parts.push(`Выпавшие карты (единственный источник выводов):\n${cardLines}`);
  }
  if (ctx.mainQuestion) parts.push(`Главный вопрос: «${ctx.mainQuestion}».`);
  parts.push(
    tarotRune
      ? `Отвечай на русском. ${TAROT_RUNE_CHAT_FORMAT} Каждый вывод — только по символам расклада с названием карты и её значением из блока выше.`
      : "Отвечай на русском. От пяти до двенадцати предложений. Без markdown. Каждый вывод — только по символам расклада с названием карты и её значением из блока выше. Тема вопроса — линза, не источник фактов. Если символы показывают тень — называй прямо."
  );
  return parts.join("\n");
}

export function buildCharacterPrompt(
  characterId: string,
  ctx: UserContext,
  extras?: {
    sessionNumber?: number;
    memory?: SessionMemory[];
    intention?: string | null;
    spreadId?: string | null;
    spreadType?: string | null;
    positionLabels?: string[];
    forceThematicReading?: boolean;
    lastUserMessage?: string;
    customQuestion?: string | null;
    numerologyBlock?: string;
    natalChartBlock?: string;
  }
): string {
  const { character, user } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, {
    mode: "reading",
    intention: extras?.intention ?? null,
    spreadId: extras?.spreadId ?? null,
    spreadType: extras?.spreadType ?? null,
    positionLabels: extras?.positionLabels,
    forceThematicReading: extras?.forceThematicReading,
    lastUserMessage: extras?.lastUserMessage ?? ctx.mainQuestion,
    customQuestion: extras?.customQuestion ?? null,
    numerologyBlock: extras?.numerologyBlock,
    natalChartBlock: extras?.natalChartBlock,
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
    numerologyBlock?: string;
    natalChartBlock?: string;
  }
): string {
  const { character, user, lastUserMessage } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, {
    mode: "chat",
    lastUserMessage: extras?.lastUserMessage ?? lastUserMessage,
    intention: extras?.intention,
    numerologyBlock: extras?.numerologyBlock,
    natalChartBlock: extras?.natalChartBlock,
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
  numerolog: ({ userName, isPaid }) =>
    `${userName}, первое число расклада уже говорит о твоём коде. ${
      isPaid
        ? "Энергия периода и совет чисел — полная картина цикла."
        : "Два следующих числа откроют период и совет... полный разбор покажет весь код."
    }`,
};

export function buildCardAwareFallbackReading(
  characterId: string,
  ctx: {
    userName: string;
    tarotCards: { name: string; meaning?: string }[];
    intention?: string | null;
    isPaid?: boolean;
    spreadId?: string | null;
    positionLabels?: string[];
  }
): string {
  if (characterId === "numerolog") {
    return buildNumerologSpreadReading({
      userName: ctx.userName,
      spreadNumbers: ctx.tarotCards.map((c) => c.name),
    });
  }

  const topicMeta = ctx.intention ? getSessionTopic(ctx.intention) : undefined;
  const topicLabel = topicMeta?.label ?? ctx.intention?.trim() ?? "расклад";
  const topicFocus = topicMeta?.focus ?? "ваша ситуация";

  const spreadId = normalizeSpreadId(ctx.spreadId);
  const positions =
    ctx.positionLabels ??
    resolveSpreadPositions(spreadId, ctx.intention as SessionTopicId | null | undefined).map(
      (p) => p.label
    );
  // Always decode every drawn card — never truncate to position count.
  const cards = ctx.tarotCards;

  const openers: Record<string, string> = {
    gadalka_marina: `${ctx.userName}, лунный свет лёг на символы — слушаю их для темы «${topicLabel}».`,
    veronika: `${ctx.userName}, карты открылись на «${topicLabel}» — вот что они говорят.`,
    ragnar: `${ctx.userName}, руны легли на «${topicLabel}» — смотрим правду без прикрас.`,
    agafya: `${ctx.userName}, дитя, вижу знамение на «${topicLabel}».`,
    "shri-raj": `${ctx.userName}, карма раскрыла «${topicLabel}» через эти символы.`,
    numerolog: `${ctx.userName}, числа легли на «${topicLabel}» — вот что они говорят.`,
  };
  const opener =
    openers[characterId in openers ? characterId : ""] ??
    `${ctx.userName}, символы раскрывают тему «${topicLabel}».`;

  // Varied templates — a single repeated skeleton is flagged as degenerate LLM loop
  // and sanitizeReadingForClient would wipe the whole reading.
  const cardFrames = [
    (pos: string, name: string, meaning: string) =>
      `Позиция «${pos}»: выпала карта «${name}». Смысл здесь — ${meaning}. Для темы «${topicLabel}» это прямой сигнал, на который стоит опереться.`,
    (pos: string, name: string, meaning: string) =>
      `В слое «${pos}» лежит «${name}». Образ говорит о таком: ${meaning}. Свяжите это с ${topicFocus} — без отрыва от самой карты.`,
    (pos: string, name: string, meaning: string) =>
      `«${name}» на месте «${pos}» подсвечивает: ${meaning}. В вопросе про «${topicLabel}» держите именно этот акцент, а не общие слова.`,
    (pos: string, name: string, meaning: string) =>
      `Дальше — «${pos}» и символ «${name}». Ключ позиции: ${meaning}. Это конкретная подсказка по «${topicLabel}», а не фон.`,
    (pos: string, name: string, meaning: string) =>
      `Карта «${name}» в «${pos}» добавляет слой: ${meaning}. Смотрите, как она меняет картину именно в вашей теме «${topicLabel}».`,
  ];

  const cardBlocks = cards.map((card, i) => {
    const pos = positions[i] ?? `Позиция ${i + 1}`;
    const rawMeaning = card.meaning?.replace(/^[^:]+:\s*/, "").trim() ?? card.name;
    const frame = cardFrames[i % cardFrames.length]!;
    return frame(pos, card.name, rawMeaning);
  });

  const names = cards.map((c) => c.name).join(" → ");

  const recapParts = cards.map((card, i) => {
    const raw = card.meaning?.replace(/^[^:]+:\s*/, "").trim() ?? card.name;
    const short = raw.split(/[.;]/)[0]?.trim() || raw;
    return `«${card.name}» (${positions[i] ?? i + 1}) — ${short}`;
  });

  const finalBlock = [
    `${ctx.userName}, вывод по всему раскладу на тему «${topicLabel}».`,
    `Линия ${names}: ${recapParts.join("; ")}.`,
    `Все ${cards.length} символов нужно читать вместе — каждая позиция усиливает соседние, а не спорит с ними.`,
    `По «${topicLabel}» держитесь всей линии карт, а не одной самой яркой.`,
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
    spreadId?: string | null;
    positionLabels?: string[];
    userMessage?: string;
  }
): Promise<ReadingGenerationResult> {
  const fullPrompt = await wrapSystemPrompt(systemPrompt);
  const thematic = Boolean(ctx.intention?.trim() && ctx.intention !== "life_death");
  const topicMeta = thematic ? getSessionTopic(ctx.intention!) : undefined;
  const topicLabel = topicMeta?.label ?? ctx.intention?.trim();
  const spreadId = normalizeSpreadId(ctx.spreadId);
  const spread = getSpread(spreadId);
  const cardCount = ctx.tarotCards.length;

  const positions =
    ctx.positionLabels ??
    resolveSpreadPositions(spreadId, ctx.intention as SessionTopicId | null | undefined).map(
      (p) => p.label
    );

  const cardsDetailed = ctx.tarotCards
    .map((c, i) => {
      const pos = positions[i] ?? `Позиция ${i + 1}`;
      const raw = c.meaning?.replace(/^[^:]+:\s*/, "").trim();
      return raw ? `${pos}: «${c.name}» — ${raw}` : `${pos}: «${c.name}»`;
    })
    .join("; ");

  const cardWord = cardCount === 1 ? "карту" : cardCount < 5 ? "карты" : "символы";

  const userContent =
    ctx.userMessage?.trim() ||
    (thematic
      ? `Расшифруй оплаченный расклад «${spread.label}» (${cardCount} ${cardWord}) для ${ctx.userName}. Тема «${topicLabel}» — только линза. Все символы: ${cardsDetailed}. Раскрой КАЖДУЮ позицию. В конце — финальный блок выводов по всему раскладу с действиями.`
      : `Расшифруй расклад «${spread.label}» (${cardCount} ${cardWord}) для ${ctx.userName}. Символы: ${cardsDetailed}. Раскрой каждую позицию. В конце — финальный блок выводов по всему раскладу с действиями.`);

  const cardNames = ctx.tarotCards.map((c) => c.name);

  const acceptReading = (raw: string | null): string | null => {
    if (!raw?.trim()) return null;
    if (isProseLikelyTruncated(raw)) return null;
    const id = ctx.characterId ?? "ragnar";
    const theaterStripped =
      isTarotRuneMasterId(id) && id !== "numerolog" ? stripTheaterFromReply(raw) : raw;
    const cleaned = sanitizeReadingForClient(theaterStripped, cardNames);
    if (cleaned.length >= 120 && isPaidSpreadTextComplete(cleaned, cardNames)) return cleaned;
    const stripped = stripMemoryLeakFromReply(theaterStripped);
    if (
      stripped.length >= 120 &&
      !isDegenerateLlmOutput(stripped) &&
      isPaidSpreadTextComplete(stripped, cardNames)
    ) {
      return stripped;
    }
    return null;
  };

  const baseMessages: ChatMessage[] = [
    { role: "system", content: fullPrompt },
    { role: "user", content: userContent },
  ];

  const maxTokens = cardCount > 5 ? 5000 : cardCount > 3 ? 4200 : 2800;

  const attemptPlans: Array<{
    messages: ChatMessage[];
    maxTokens: number;
    timeoutMs: number;
    maxAttempts: number;
    temperature?: number;
  }> = thematic
    ? [
        { messages: baseMessages, maxTokens, timeoutMs: 120_000, maxAttempts: 2, temperature: 0.85 },
        {
          messages: baseMessages,
          maxTokens: Math.round(maxTokens * 0.75),
          timeoutMs: 90_000,
          maxAttempts: 1,
          temperature: 0.85,
        },
      ]
    : [{ messages: baseMessages, maxTokens, timeoutMs: 120_000, maxAttempts: 2, temperature: 0.85 }];

  for (const plan of attemptPlans) {
    let text = await completeProseWithContinuation(plan.messages, {
      maxTokens: plan.maxTokens,
      temperature: plan.temperature ?? 0.85,
      maxPasses: cardCount > 5 ? 4 : 3,
      cardNames,
    });
    if (text && !isPaidSpreadTextComplete(text, cardNames)) {
      text = await ensurePaidSpreadTextComplete(plan.messages, text, cardNames, {
        maxTokens: Math.max(2200, Math.round(plan.maxTokens * 0.5)),
        temperature: plan.temperature ?? 0.85,
        maxRounds: 4,
      });
    }
    const accepted = acceptReading(text);
    if (accepted) return { text: accepted, fromLlm: true };
  }

  // Fail-closed: never synthesize template prose as a paid reading success.
  return { text: "", fromLlm: false };
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
      maxTokens: 1800,
      vision: Boolean(imageBase64),
      isPaid,
      temperature,
    });
  }

  let reply = await attempt(safeHistory);
  if (!reply && safeHistory.length > LLM_CONTEXT_MESSAGES) {
    reply = await attempt(safeHistory.slice(-LLM_CONTEXT_MESSAGES));
  }
  return reply;
}

/** One retry with explicit anti-loop correction (OpenRouter). */
export async function regenerateChatReply(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  opts: {
    rejectionReason: string;
    imageBase64?: string;
    isPaid?: boolean;
    temperature?: number;
  }
): Promise<string | null> {
  const correction = `

[КОРРЕКЦИЯ — предыдущий ответ отклонён: ${opts.rejectionReason}]
Ответь заново на последнюю реплику клиента:
- каждая руна/карта — своя мысль, без повторения одной фразы;
- не цитируй клиента дословно;
- 5–10 предложений, один вопрос в конце;
- опирайся только на символы расклада и суть вопроса.`;

  return generateChatReply(
    `${systemPrompt}${correction}`,
    messages,
    opts.imageBase64,
    opts.isPaid ?? false,
    opts.temperature ?? 0.75
  );
}

/** Deterministic short reply when LLM loops or fails (chat follow-up, not full spread). */
export function buildChatFallbackReply(
  characterId: string,
  ctx: {
    userName: string;
    lastUserMessage: string;
    cardNames: string[];
    intention?: string | null;
    spreadId?: string | null;
  }
): string {
  const name = ctx.userName?.trim() || "друг";
  const question = ctx.lastUserMessage.trim().slice(0, 280);
  const spreadId = normalizeSpreadId(ctx.spreadId);
  const required = requiredCardCount(spreadId, "new");
  const cards = ctx.cardNames.slice(0, required);

  if (!cards.length) {
    return `${name}, слышу тебя. Сформулируй главный страх одним предложением — отвечу по символам, как только канал соберётся.`;
  }

  const topicMeta = ctx.intention ? getSessionTopic(ctx.intention) : undefined;
  const topic = topicMeta?.label ?? "твой вопрос";
  const positions = resolveSpreadPositions(
    spreadId,
    ctx.intention as SessionTopicId | null | undefined
  ).map((p) => p.label);

  if (cards.length === 1) {
    return `${name}, «${cards[0]}» отвечает на «${question}» по теме «${topic}». Один символ — один совет: не гадай на страхе, сделай один конкретный шаг в ближайшие три дня. Что для тебя сейчас важнее — ясность или комфорт?`;
  }

  const cardInsights = [
    "в корне показывает, что уже назревает",
    "в центре требует внимания сейчас",
    "на горизонте задаёт направление",
    "подсвечивает скрытый ресурс",
    "указывает на точку роста",
    "снимает лишнее напряжение",
    "даёт опору на ближайшие сутки",
    "закрывает тему одним ясным образом",
    "открывает новый угол зрения",
    "сводит линии в одну картину",
  ];

  const cardLines = cards
    .map((card, i) => {
      const pos = positions[i] ?? `позиция ${i + 1}`;
      const insight = cardInsights[i % cardInsights.length];
      return `«${card}» (${pos}) ${insight}.`;
    })
    .join("\n");

  return `${name}, символы говорят по теме «${topic}».

${cardLines}

Ты спросил: «${question}». Расклад просит ясности, не спешки.

Что для тебя сейчас важнее — безопасность или свобода?`;
}

export function llmUnavailableReply(options?: { runesRefunded?: boolean }): string {
  if (options?.runesRefunded) {
    return "Сейчас не удалось связаться с мастером — канал перегружен. Руны не списаны. Повторите вопрос.";
  }
  return "Сейчас не удалось связаться с мастером. Повторите вопрос через минуту.";
}

export { lifeFocusLabel, buildAstroMeta };
