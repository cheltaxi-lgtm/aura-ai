import { buildUserMessageWithImage, completeChat, type ChatMessage } from "@/lib/llm";
import { wrapSystemPrompt } from "@/lib/prompt-policy";
import { completeProseWithContinuation } from "@/lib/prose-completion";
import { isProseLikelyTruncated } from "@/lib/prose-truncation";
import {
  ensurePaidSpreadTextComplete,
  isPaidSpreadTextComplete,
} from "@/lib/spread-reading-complete";
import {
  buildQualityRepairHint,
  evaluatePaidReadingQuality,
  listPaidReadingQualityIssues,
  meetsPaidDensityFloor,
  normalizePaidReadingStructure,
  type ReadingQualityIssue,
} from "@/lib/reading-quality-gate";
import { paidSpreadMaxTokens } from "@/lib/prompts/premium-reading";
import { sanitizeChatHistory, LLM_CONTEXT_MESSAGES, type ChatHistoryMessage } from "@/lib/chat-sanitize";
import {
  sanitizeReadingForClient,
  stripMemoryLeakFromReply,
  isDegenerateLlmOutput,
  stripTheaterFromReply,
} from "@/lib/chat-reply-sanitize";
import { buildSystemPrompt, fromLegacyContext } from "@/lib/prompts";
import { GLOBAL_MASTER_RULES, LANGUAGE_STYLE_RULES, THEMATIC_SPREAD_READING_RULES, CARD_GROUNDED_READING_RULES, CHAT_CLARIFYING_QUESTION_RULE, spreadFinalConclusionRules, responseFormatForSpread, thematicSpreadReadingRules } from "@/lib/prompts/format";
import {
  isTarotRuneMasterId,
  TAROT_RUNE_THEATER_BAN,
  TAROT_RUNE_MARKDOWN_FORMAT,
  TAROT_RUNE_CHAT_FORMAT,
  tarotRuneThematicReadingRules,
} from "@/lib/prompts/tarot-rune-format";
import { MARINA_PERSONA } from "@/lib/prompts/masters/marina";
import { getSessionTopic } from "@/lib/session-topics";
import type { SessionMemory } from "@/lib/prompts/types";
import { getSpread, normalizeSpreadId, resolveSpreadPositions } from "@/lib/spreads";
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
  const parts = [
    buildHumanMasterPersona(blogger, knowledge),
    CARD_GROUNDED_READING_RULES,
    CHAT_CLARIFYING_QUESTION_RULE,
  ];
  const tarotRune = isTarotRuneMasterId(blogger.slug ?? "");

  if (ctx.userName) {
    parts.push(
      `Клиента зовут ${ctx.userName}. Обращайся к клиенту по имени. Это имя спрашивающего — не подставляй его вместо «он/она», если клиент спрашивает о другом человеке и сам это имя не назвал.`
    );
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
    humanDesignBlock?: string;
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
    humanDesignBlock: extras?.humanDesignBlock,
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
    humanDesignBlock?: string;
  }
): string {
  const { character, user, lastUserMessage } = fromLegacyContext(characterId, ctx, extras);
  return buildSystemPrompt(character, user, {
    mode: "chat",
    lastUserMessage: extras?.lastUserMessage ?? lastUserMessage,
    intention: extras?.intention,
    numerologyBlock: extras?.numerologyBlock,
    natalChartBlock: extras?.natalChartBlock,
    humanDesignBlock: extras?.humanDesignBlock,
  });
}

export type ReadingGenerationResult = {
  text: string;
  fromLlm: boolean;
  provenance?: import("@/lib/ai-generation-contract").AiProvenance;
};

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

  const { isCrisisSurvivalQuestion } = await import("@/lib/crisis-question");
  const crisisQ = isCrisisSurvivalQuestion(ctx.userMessage ?? ctx.intention);
  const crisisRule = crisisQ
    ? "\n\nВАЖНО: вопрос о жизни/войне/выживании — ответь на буквальный запрос по доминанте символов. Словарные ярлыки («романтика», «ухаживание», «предложение») не сюжет. Не смягчай Башню/пятёрки/десятки мечей утешительной поэзией."
    : "";

  const userContent =
    (ctx.userMessage?.trim()
      ? ctx.userMessage.trim()
      : thematic
        ? `Расшифруй оплаченный расклад «${spread.label}» (${cardCount} ${cardWord}) для ${ctx.userName}. Тема «${topicLabel}» — только линза. Все символы: ${cardsDetailed}. Раскрой КАЖДУЮ позицию. В конце — финальный блок выводов по всему раскладу с действиями.`
        : `Расшифруй расклад «${spread.label}» (${cardCount} ${cardWord}) для ${ctx.userName}. Символы: ${cardsDetailed}. Раскрой каждую позицию. В конце — финальный блок выводов по всему раскладу с действиями.`) +
    crisisRule;

  const cardNames = ctx.tarotCards.map((c) => c.name);
  const characterId = ctx.characterId ?? "ragnar";

  const passesPremiumQuality = (candidate: string): boolean => {
    if (!ctx.isPaid) return true;
    return evaluatePaidReadingQuality(candidate, { cardCount, characterId }).ok;
  };

  const prepareReadingCandidate = (raw: string): string => {
    const theaterStripped =
      isTarotRuneMasterId(characterId) && characterId !== "numerolog"
        ? stripTheaterFromReply(raw)
        : raw;
    return ctx.isPaid
      ? normalizePaidReadingStructure(theaterStripped, characterId, ctx.userName)
      : theaterStripped;
  };

  const acceptReading = (raw: string | null): string | null => {
    if (!raw?.trim()) return null;
    if (isProseLikelyTruncated(raw)) return null;
    const prepared = prepareReadingCandidate(raw);
    const cleaned = sanitizeReadingForClient(prepared, cardNames);
    if (cleaned.length >= 120 && isPaidSpreadTextComplete(cleaned, cardNames) && passesPremiumQuality(cleaned)) {
      return cleaned;
    }
    const stripped = stripMemoryLeakFromReply(prepared);
    if (
      stripped.length >= 120 &&
      !isDegenerateLlmOutput(stripped) &&
      isPaidSpreadTextComplete(stripped, cardNames) &&
      passesPremiumQuality(stripped)
    ) {
      return stripped;
    }
    return null;
  };

  /** Prefer imperfect complete AI prose over empty paid delivery / refund. */
  const softAcceptReading = (raw: string | null): string | null => {
    if (!ctx.isPaid || !raw?.trim()) return null;
    if (isProseLikelyTruncated(raw)) return null;
    const prepared = prepareReadingCandidate(raw);
    const cleaned = sanitizeReadingForClient(prepared, cardNames);
    if (
      cleaned.length >= 200 &&
      meetsPaidDensityFloor(cleaned, cardCount) &&
      !isDegenerateLlmOutput(cleaned) &&
      isPaidSpreadTextComplete(cleaned, cardNames)
    ) {
      return cleaned;
    }
    const stripped = stripMemoryLeakFromReply(prepared);
    if (
      stripped.length >= 200 &&
      meetsPaidDensityFloor(stripped, cardCount) &&
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

  // Same budget as chat/daily/photo — one formula for every paid full spread.
  const maxTokens = ctx.isPaid
    ? paidSpreadMaxTokens(cardCount)
    : cardCount > 5
      ? 4500
      : cardCount > 3
        ? 3800
        : 2600;

  const startedAt = Date.now();
  const { generateValidatedAiText } = await import("@/lib/validated-ai-generation");
  const { missingCardMentions } = await import("@/lib/chat-reply-sanitize");
  const validated = await generateValidatedAiText({
    messages: baseMessages,
    inputParts: [
      ctx.characterId ?? "ragnar",
      ctx.intention ?? null,
      spreadId,
      cardNames,
      ctx.userMessage ?? null,
    ],
    maxTokens,
    temperature: 0.85,
    // Fail over / soft-ship instead of hanging on one slow primary+repair.
    timeoutMs: ctx.isPaid ? 45_000 : 50_000,
    modelFamily: ctx.isPaid ? "paid" : "chat",
    // Paid: no same-model repair (doubles latency). Next model in chain is faster spare.
    maxRepairRounds: ctx.isPaid ? 0 : 1,
    allowReasoningFallback: ctx.isPaid,
    chatOptions: {
      skipTemperatureRetry: true,
      isPaid: ctx.isPaid,
      maxAttempts: 1,
    },
    validate: (text) => {
      const accepted = acceptReading(text);
      if (accepted) return { ok: true };
      const prepared = ctx.isPaid ? prepareReadingCandidate(text) : text;
      const missing = missingCardMentions(prepared, cardNames);
      if (missing.length) {
        return {
          ok: false,
          code: "validation_failed",
          detail: `missing_cards:${missing.join("|")}`,
        };
      }
      if (ctx.isPaid) {
        const issues = listPaidReadingQualityIssues(prepared, { cardCount, characterId });
        if (issues.length) {
          return {
            ok: false,
            code: "validation_failed",
            detail: `quality:${issues.join("|")}`,
          };
        }
      }
      return { ok: false, code: "validation_failed", detail: "incomplete_or_truncated" };
    },
    buildRepairMessages: (failedText, detail) => {
      const prepared = ctx.isPaid ? prepareReadingCandidate(failedText) : failedText;
      const missing =
        detail?.startsWith("missing_cards:")
          ? detail.slice("missing_cards:".length).split("|").filter(Boolean)
          : missingCardMentions(prepared, cardNames);
      const qualityFromDetail = detail?.startsWith("quality:")
        ? (detail.slice("quality:".length).split("|").filter(Boolean) as ReadingQualityIssue[])
        : null;
      const qualityIssues: ReadingQualityIssue[] =
        qualityFromDetail ?? listPaidReadingQualityIssues(prepared, { cardCount, characterId });
      const missingLine = missing.length
        ? `Обязательно назови по имени и раскрой: ${missing.map((n) => `«${n}»`).join(", ")}.`
        : "Раскрой каждую позицию по имени символа.";
      const qualityLine = qualityIssues.length ? ` ${buildQualityRepairHint(qualityIssues)}` : "";
      const crisisLine = isCrisisSurvivalQuestion(ctx.userMessage ?? ctx.intention)
        ? " Вопрос о жизни/войне — ответь по доминанте символов прямо, без романтических ярлыков и без отказа от темы."
        : "";
      return [
        ...baseMessages,
        { role: "assistant", content: prepared || failedText },
        {
          role: "user",
          content: `Перепиши расклад целиком премиально и плотно, без воды. ${missingLine}${qualityLine}${crisisLine} В конце — полный финальный блок выводов. Без удержания и без шаблонных отказов.`,
        },
      ];
    },
  });

  if (validated.ok) {
    const accepted =
      acceptReading(validated.content) ?? softAcceptReading(validated.content);
    if (accepted) {
      console.info("generateReading ok", {
        characterId: ctx.characterId,
        intention: ctx.intention,
        cardCount,
        ms: Date.now() - startedAt,
        model: validated.provenance?.model,
        maxTokens,
      });
      return { text: accepted, fromLlm: true, provenance: validated.provenance };
    }
  }

  // Bounded legacy continuation — one pass, then one completion round.
  let text = await completeProseWithContinuation(baseMessages, {
    maxTokens,
    temperature: 0.85,
    maxPasses: 1,
    cardNames,
    isPaid: ctx.isPaid,
  });
  if (text && !isPaidSpreadTextComplete(text, cardNames)) {
    text = await ensurePaidSpreadTextComplete(baseMessages, text, cardNames, {
      maxTokens: Math.max(1400, Math.round(maxTokens * 0.4)),
      temperature: 0.85,
      maxRounds: 1,
      isPaid: ctx.isPaid,
    });
  }
  const accepted = acceptReading(text) ?? softAcceptReading(text);
  if (accepted) {
    console.info("generateReading ok-after-continuation", {
      characterId: ctx.characterId,
      intention: ctx.intention,
      cardCount,
      ms: Date.now() - startedAt,
      maxTokens,
    });
    return { text: accepted, fromLlm: true };
  }

  const bestDraft = (text || (validated.ok ? validated.content : "") || "").trim();
  // Prefer shipping a dense draft over multi-minute rescue when quality floor is met.
  const preRescueSoft = softAcceptReading(bestDraft);
  if (preRescueSoft) {
    console.warn("generateReading soft-shipped before rescue", {
      characterId: ctx.characterId,
      intention: ctx.intention,
      cardCount,
      ms: Date.now() - startedAt,
    });
    return { text: preRescueSoft, fromLlm: true };
  }

  // Last-resort AI rescue: lean prompt across the whole model chain, then
  // AI-written blocks for skipped symbols. Still 100% model-authored.
  const { rescueReadingWithAi } = await import("@/lib/reading-ai-rescue");
  const rescued = await rescueReadingWithAi({
    characterId: ctx.characterId ?? "veronika",
    userName: ctx.userName,
    question:
      ctx.userMessage?.trim() ||
      (topicLabel ? `Расклад на тему «${topicLabel}»` : `Расклад «${spread.label}»`),
    cards: ctx.tarotCards.map((c, i) => ({
      name: c.name,
      position: positions[i] ?? `Позиция ${i + 1}`,
      meaning: c.meaning,
    })),
    maxTokens,
    previousDraft: bestDraft,
    accept: acceptReading,
    softAccept: softAcceptReading,
  });

  if (rescued) {
    console.warn("generateReading rescued by fallback AI pass", {
      characterId: ctx.characterId,
      intention: ctx.intention,
      cardCount,
      validatedDetail: validated.ok ? null : validated.detail,
    });
    return { text: rescued, fromLlm: true };
  }

  const softShipped = softAcceptReading(bestDraft);
  if (softShipped) {
    console.warn("generateReading soft-shipped after quality/rescue exhaustion", {
      characterId: ctx.characterId,
      intention: ctx.intention,
      cardCount,
      validatedDetail: validated.ok ? null : validated.detail,
      issues: listPaidReadingQualityIssues(softShipped, { cardCount, characterId }),
    });
    return { text: softShipped, fromLlm: true };
  }

  console.error("generateReading: all AI attempts failed", {
    characterId: ctx.characterId,
    intention: ctx.intention,
    cardCount,
    missing: missingCardMentions(bestDraft, cardNames),
    validatedOk: validated.ok,
    validatedDetail: validated.ok ? null : validated.detail,
  });

  // Only a total provider outage reaches this point — never template prose.
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

export function llmUnavailableReply(options?: { runesRefunded?: boolean }): string {
  if (options?.runesRefunded) {
    return "Сейчас не удалось связаться с мастером — канал перегружен. Руны не списаны. Повторите вопрос.";
  }
  return "Сейчас не удалось связаться с мастером. Повторите вопрос через минуту.";
}

export { lifeFocusLabel, buildAstroMeta };
