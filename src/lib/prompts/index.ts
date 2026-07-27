import { lifeFocusLabel, type LifeFocus } from "@/lib/astro-profile";
import { todayLabelRu } from "@/lib/prompt-date";

import { CONTEXT_RULES, RESPONSE_FORMAT, THEMATIC_SPREAD_READING_RULES, CARD_GROUNDED_READING_RULES, CHAT_CLARIFYING_QUESTION_RULE, spreadFinalConclusionRules, responseFormatForSpread, thematicSpreadReadingRules, READING_FORWARD_HOOK } from "./format";
import {
  isTarotRuneMasterId,
  TAROT_RUNE_THEATER_BAN,
  TAROT_RUNE_MARKDOWN_FORMAT,
  TAROT_RUNE_CHAT_FORMAT,
  tarotRuneThematicReadingRules,
} from "./tarot-rune-format";
import { buildGenderPronounBlock } from "./gender-context";
import { resolveClientGender } from "@/lib/russian-name-gender";
import { AGAFYA_PERSONA } from "./masters/agafya";
import { RAGNAR_PERSONA, RAGNAR_VOICE_SAMPLE } from "./masters/ragnar";
import { SHRI_RAJ_PERSONA } from "./masters/shri-raj";
import { VERONIKA_PERSONA } from "./masters/veronika";
import { NUMEROLOG_PERSONA } from "./masters/numerolog";
import { buildNumerologyChatContext } from "@/lib/numerology/topic-handlers";
import { resolveMasterDeckSystem, getDeckPositions } from "@/lib/decks";
import { hasCompleteSpread, normalizeSpreadId, resolveSpreadPositions, getSpread } from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";
import { formatLegacySessionMemories } from "./memory";
import { composeMemoryQueryText } from "@/lib/memory/memory-relevance";
import { getSpreadInstructions } from "./spread-instructions";
import { buildTopicBlock, mergeTopics, topicsFromIntention, type TopicKey } from "./topics";
import type { CharacterKey, PromptUserContext, ReadingCard, SessionMemory } from "./types";

const MASTER_PERSONA: Record<CharacterKey, string> = {
  ragnar: `${RAGNAR_PERSONA}\n\nПРИМЕР ПРАВИЛЬНОГО ГОЛОСА РАГНАРА:\n${RAGNAR_VOICE_SAMPLE}`,
  veronika: VERONIKA_PERSONA,
  agafya: AGAFYA_PERSONA,
  "shri-raj": SHRI_RAJ_PERSONA,
  numerolog: NUMEROLOG_PERSONA,
};

const MASTER_DISPLAY: Record<CharacterKey, string> = {
  ragnar: "Рагнар Хрёгвидссон",
  veronika: "Вероника Лунная",
  agafya: "Баба Агафья",
  "shri-raj": "Гуру Шри Радж Кумар",
  numerolog: "Эвелина Числа",
};

export function isCharacterKey(id: string): id is CharacterKey {
  return id in MASTER_PERSONA;
}

function astroLines(user: PromptUserContext): string[] {
  const lines: string[] = [];
  if (user.astroMeta) {
    lines.push(
      `Год рождения: ${user.astroMeta.birthYear}, возраст: ${user.astroMeta.age}, китайский знак: ${user.astroMeta.chineseZodiac}, число пути: ${user.astroMeta.lifePath}, стихия: ${user.astroMeta.element}.`
    );
  }
  if (user.birthTime) lines.push(`Время рождения: ${user.birthTime}.`);
  if (user.birthCity) lines.push(`Город рождения: ${user.birthCity}.`);
  if (user.lifeFocus) {
    lines.push(
      `Сейчас клиента волнует: ${lifeFocusLabel(user.lifeFocus as LifeFocus) ?? user.lifeFocus}.`
    );
  }
  if (user.mainQuestion) {
    lines.push(`Главный вопрос клиента: «${user.mainQuestion}». Свяжи ответ с этим запросом.`);
  }
  return lines;
}

function spreadLabelsForPrompt(
  character: CharacterKey,
  spreadId?: string | null,
  intention?: string | null,
  positionLabels?: string[],
  cardCount = 3
): string[] {
  if (positionLabels?.length) {
    return positionLabels.slice(0, Math.max(cardCount, positionLabels.length));
  }
  if (spreadId) {
    return resolveSpreadPositions(spreadId, intention as SessionTopicId | null | undefined).map(
      (p) => p.label
    );
  }
  const deckLabels = [...getDeckPositions(resolveMasterDeckSystem(character))];
  if (cardCount <= deckLabels.length) return deckLabels.slice(0, cardCount);
  return Array.from({ length: cardCount }, (_, i) => deckLabels[i] ?? `Позиция ${i + 1}`);
}

function cardsBlock(
  cards: string[] | ReadingCard[],
  labels = ["Прошлое", "Настоящее", "Будущее"]
): string {
  if (!cards.length) return "Карты расклада пока не переданы — опирайся на вопрос и знак клиента.";
  return cards
    .map((c, i) => {
      const label = labels[i] ?? `Позиция ${i + 1}`;
      if (typeof c === "string") return `${label}: «${c}»`;
      return `${label}: «${c.name}» — ${c.meaning}`;
    })
    .join("\n");
}

function clientBlock(
  user: PromptUserContext,
  character: CharacterKey,
  lastUserMessage?: string,
  spreadId?: string | null,
  intention?: string | null,
  positionLabels?: string[]
): string {
  const sessionLabel = user.sessionNumber && user.sessionNumber > 1
    ? `Это ${user.sessionNumber}-й сеанс с этим клиентом.`
    : "Первый или ранний сеанс — заложи доверие и глубину.";

  const questionLine = lastUserMessage?.trim()
    ? `- Последний вопрос клиента: «${lastUserMessage.trim()}» — ответь именно на него, опираясь на символы.`
    : "";

  const cardCount = user.cards.length;

  return `
ДАННЫЕ КЛИЕНТА:
- Имя: ${user.name} (обращайся по имени минимум дважды)
- Пол: ${
    (() => {
      const g = resolveClientGender(user.gender, user.name);
      return g === "male" ? "мужчина" : g === "female" ? "женщина" : "не указан";
    })()
  }
- Знак зодиака: ${user.zodiac}
- Дата рождения: ${user.birthDate}
- Сегодня: ${user.today?.trim() || todayLabelRu()}
- ${sessionLabel}
${questionLine}

ВЫПАВШИЕ СИМВОЛЫ (единственный источник выводов — читай значения каждой карты):
${cardsBlock(user.cards, spreadLabelsForPrompt(character, spreadId, intention, positionLabels, cardCount))}
${astroLines(user).map((l) => `- ${l}`).join("\n")}`;
}

function paywallRule(isPaid: boolean | undefined, cardCount: number): string {
  if (isPaid) {
    return cardCount <= 1
      ? "Клиент с полным доступом — дай полную глубину по символу без удерживания."
      : `Клиент с полным доступом — дай полную глубину по всем ${cardCount} символам без удерживания.`;
  }
  if (cardCount === 1) {
    return "Клиент на бесплатном/частичном доступе: дай интригующий крючок без полной расшифровки, намекни что глубина откроется дальше.";
  }
  if (cardCount <= 3) {
    return `Клиент на бесплатном/частичном доступе: подробно раскрой ПЕРВЫЙ символ. По остальным ${cardCount - 1} — интригующий крючок без полной расшифровки, намекни что глубина откроется дальше.`;
  }
  return `Клиент на бесплатном/частичном доступе: подробно раскрой ПЕРВЫЙ символ. По остальным ${cardCount - 1} — краткий крючок без полной расшифровки.`;
}

export interface BuildPromptOptions {
  mode?: "chat" | "reading";
  topics?: TopicKey[];
  lastUserMessage?: string;
  intention?: string | null;
  spreadId?: string | null;
  /** e.g. "photo" — relaxes required card count for hasCompleteSpread */
  spreadType?: string | null;
  /** Override position labels (photo redraw / custom layouts) */
  positionLabels?: string[];
  customQuestion?: string | null;
  /** Pre-built numerology block (avoids double computation in chat API). */
  numerologyBlock?: string;
  /** Pre-built natal chart block for Shri Raj (server-computed). */
  natalChartBlock?: string;
  /** Force thematic depth rules even without a catalog intention (photo / custom) */
  forceThematicReading?: boolean;
}

export function buildSystemPrompt(
  character: CharacterKey,
  user: PromptUserContext,
  options: BuildPromptOptions = {}
): string {
  const mode = options.mode ?? "chat";
  const persona = MASTER_PERSONA[character];
  const displayName = MASTER_DISPLAY[character];
  const thematicReading =
    mode === "reading" &&
    user.isPaid &&
    (Boolean(options.forceThematicReading) ||
      Boolean(options.intention?.trim() && options.intention !== "life_death"));

  const topics =
    options.topics ??
    (options.lastUserMessage
      ? mergeTopics(options.lastUserMessage, options.intention)
      : topicsFromIntention(options.intention));

  const hasSpread = hasCompleteSpread(
    user.cards.map((c) => (typeof c === "string" ? c : c.name)),
    options.spreadId,
    options.spreadType
  );

  const numerologyBlock =
    options.numerologyBlock ??
    (character === "numerolog"
      ? buildNumerologyChatContext({
          birthDate: user.birthDate,
          profileName: user.name,
          lastUserMessage: options.lastUserMessage,
        }).prompt
      : "");

  const tarotRune = isTarotRuneMasterId(character);

  const spreadCardCount = user.cards.length || (options.spreadId ? getSpread(options.spreadId).cardCount : 3);

  const formatBlock = (() => {
    if (character === "numerolog") {
      if (thematicReading) return thematicSpreadReadingRules(spreadCardCount);
      return mode === "reading" && spreadCardCount !== 3
        ? responseFormatForSpread(spreadCardCount)
        : RESPONSE_FORMAT;
    }
    if (tarotRune) {
      const theater = TAROT_RUNE_THEATER_BAN;
      if (mode === "chat") return `${theater}\n${TAROT_RUNE_CHAT_FORMAT}`;
      if (thematicReading) {
        return `${theater}\n${tarotRuneThematicReadingRules(spreadCardCount)}`;
      }
      return `${theater}\n${TAROT_RUNE_MARKDOWN_FORMAT}`;
    }
    if (thematicReading) return thematicSpreadReadingRules(spreadCardCount);
    if (mode === "reading" && spreadCardCount !== 3) {
      return responseFormatForSpread(spreadCardCount);
    }
    return RESPONSE_FORMAT;
  })();

  const spreadFinalBlock =
    hasSpread && user.isPaid && mode === "reading" && !tarotRune
      ? spreadFinalConclusionRules(spreadCardCount)
      : "";

  // Forward-хук: приглашение продолжить в чате в конце расклада (кроме «жизнь/смерть»).
  const readingForwardHook =
    mode === "reading" && hasSpread && options.intention !== "life_death"
      ? READING_FORWARD_HOOK
      : "";

  const legacyMemoryQuery = composeMemoryQueryText({
    lastUserMessage: options.lastUserMessage,
    intention: options.intention,
    mainQuestion: user.mainQuestion,
  });

  const parts = [
    persona,
    numerologyBlock,
    options.natalChartBlock ?? "",
    CONTEXT_RULES,
    // SPREAD_TRUTH_RULES is injected once by wrapSystemPrompt — do not repeat it here.
    ...(hasSpread ? [CARD_GROUNDED_READING_RULES] : []),
    clientBlock(
      user,
      character,
      options.lastUserMessage,
      options.spreadId,
      options.intention,
      options.positionLabels
    ),
    buildGenderPronounBlock(user, options.lastUserMessage),
    formatLegacySessionMemories(user.memory ?? [], displayName, legacyMemoryQuery),
    buildTopicBlock(character, topics),
    paywallRule(user.isPaid, spreadCardCount),
    mode === "chat"
      ? "РЕЖИМ: живой чат — ответь на последний вопрос клиента по текущему раскладу. Для ответа и продолжения вплетай максимум 1–2 активные релевантные опоры памяти, только когда они про ту же тему; черновики не используй. Заверши ответ движением вперёд: ОДИН уточняющий вопрос ИЛИ крючок на продолжение (не оба) — диалог не должен вставать."
      : thematicReading
        ? `РЕЖИМ: оплаченный тематический расклад «${options.spreadId ? getSpread(options.spreadId).label : "расклад"}» — ${spreadCardCount} символов, максимальная глубина по теме, без воды.`
        : spreadCardCount === 3
          ? "РЕЖИМ: полный расклад — дай развёрнутую расшифровку трёх символов."
          : `РЕЖИМ: полный расклад — дай развёрнутую расшифровку всех ${spreadCardCount} символов.`,
    mode === "chat" ? CHAT_CLARIFYING_QUESTION_RULE : "",
    formatBlock,
    spreadFinalBlock,
    mode === "reading" && hasSpread && options.spreadType !== "photo"
      ? getSpreadInstructions(
          character,
          options.spreadId,
          options.intention === "custom" ? options.customQuestion : null
        )
      : "",
    readingForwardHook,
  ];

  return parts.filter(Boolean).join("\n\n");
}

/** Map legacy chat context into PromptUserContext. */
export function fromLegacyContext(
  characterId: string,
  ctx: {
    userName?: string;
    gender?: string;
    zodiac?: string;
    birthDate?: string;
    today?: string;
    tarotCards?: ReadingCard[];
    birthTime?: string;
    birthCity?: string;
    lifeFocus?: string;
    mainQuestion?: string;
    astroMeta?: PromptUserContext["astroMeta"];
    isPaid?: boolean;
  },
  extras?: { sessionNumber?: number; memory?: SessionMemory[]; lastUserMessage?: string; spreadId?: string | null }
): { character: CharacterKey; user: PromptUserContext; lastUserMessage?: string } {
  const character: CharacterKey = isCharacterKey(characterId) ? characterId : "ragnar";
  const spreadId = normalizeSpreadId(extras?.spreadId);
  const maxCards = extras?.spreadId
    ? getSpread(spreadId).cardCount
    : ctx.tarotCards?.length ?? 3;
  const cards: ReadingCard[] =
    ctx.tarotCards?.slice(0, maxCards).map((c) => ({
      name: c.name,
      meaning: c.meaning ?? "",
    })) ?? [];

  return {
    character,
    user: {
      name: ctx.userName ?? "друг",
      gender: ctx.gender,
      zodiac: ctx.zodiac ?? "",
      birthDate: ctx.birthDate ?? "",
      cards,
      sessionNumber: extras?.sessionNumber,
      today: ctx.today,
      birthTime: ctx.birthTime,
      birthCity: ctx.birthCity,
      lifeFocus: ctx.lifeFocus,
      mainQuestion: ctx.mainQuestion,
      astroMeta: ctx.astroMeta,
      isPaid: ctx.isPaid,
      memory: extras?.memory,
    },
    lastUserMessage: extras?.lastUserMessage ?? ctx.mainQuestion,
  };
}

export { MASTER_DISPLAY, MASTER_PERSONA };
