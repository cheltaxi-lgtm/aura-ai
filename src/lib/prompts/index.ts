import { lifeFocusLabel, type LifeFocus } from "@/lib/astro-profile";

import { CONTEXT_RULES, RESPONSE_FORMAT, THEMATIC_SPREAD_READING_RULES, CARD_GROUNDED_READING_RULES, SPREAD_FINAL_CONCLUSION_RULES } from "./format";
import {
  isTarotRuneMasterId,
  TAROT_RUNE_THEATER_BAN,
  TAROT_RUNE_MARKDOWN_FORMAT,
  TAROT_RUNE_CHAT_FORMAT,
  TAROT_RUNE_THEMATIC_READING_RULES,
} from "./tarot-rune-format";
import { buildGenderPronounBlock, SPREAD_TRUTH_RULES } from "./gender-context";
import { AGAFYA_PERSONA } from "./masters/agafya";
import { RAGNAR_PERSONA, RAGNAR_VOICE_SAMPLE } from "./masters/ragnar";
import { SHRI_RAJ_PERSONA } from "./masters/shri-raj";
import { VERONIKA_PERSONA } from "./masters/veronika";
import { NUMEROLOG_PERSONA } from "./masters/numerolog";
import { buildNumerologyChatContext } from "@/lib/numerology/topic-handlers";
import { resolveMasterDeckSystem, getDeckPositions } from "@/lib/decks";
import { buildMemoryBlock } from "./memory";
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
  "shri-raj": "Гуру Шри Радж Кumar",
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

function spreadLabelsForCharacter(character: CharacterKey): string[] {
  const positions = getDeckPositions(resolveMasterDeckSystem(character));
  return [...positions].slice(0, 3);
}

function cardsBlock(
  cards: string[] | ReadingCard[],
  labels = ["Прошлое", "Настоящее", "Будущее"]
): string {
  if (!cards.length) return "Карты расклада пока не переданы — опирайся на вопрос и знак клиента.";
  return cards
    .slice(0, 3)
    .map((c, i) => {
      const label = labels[i] ?? `Позиция ${i + 1}`;
      if (typeof c === "string") return `${label}: «${c}»`;
      return `${label}: «${c.name}» — ${c.meaning}`;
    })
    .join("\n");
}

function clientBlock(user: PromptUserContext, character: CharacterKey, lastUserMessage?: string): string {
  const sessionLabel = user.sessionNumber && user.sessionNumber > 1
    ? `Это ${user.sessionNumber}-й сеанс с этим клиентом.`
    : "Первый или ранний сеанс — заложи доверие и глубину.";

  const questionLine = lastUserMessage?.trim()
    ? `- Последний вопрос клиента: «${lastUserMessage.trim()}» — ответь именно на него, опираясь на символы.`
    : "";

  return `
ДАННЫЕ КЛИЕНТА:
- Имя: ${user.name} (обращайся по имени минимум дважды)
- Пол: ${user.gender ?? "не указан"}
- Знак зодиака: ${user.zodiac}
- Дата рождения: ${user.birthDate}
${user.today ? `- Сегодня: ${user.today}` : ""}
- ${sessionLabel}
${questionLine}

ВЫПАВШИЕ СИМВОЛЫ (единственный источник выводов — читай значения каждой карты):
${cardsBlock(user.cards, spreadLabelsForCharacter(character))}
${astroLines(user).map((l) => `- ${l}`).join("\n")}`;
}

function paywallRule(isPaid: boolean | undefined): string {
  if (isPaid) {
    return "Клиент с полным доступом — дай полную глубину по всем трём символам без удерживания.";
  }
  return `Клиент на бесплатном/частичном доступе: подробно раскрой ПЕРВЫЙ символ (Прошлое). По 2-му и 3-му — интригующий крючок без полной расшифровки, намекни что глубина откроется дальше.`;
}

export interface BuildPromptOptions {
  mode?: "chat" | "reading";
  topics?: TopicKey[];
  lastUserMessage?: string;
  intention?: string | null;
  /** Pre-built numerology block (avoids double computation in chat API). */
  numerologyBlock?: string;
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
    Boolean(options.intention?.trim() && options.intention !== "life_death") &&
    user.isPaid;

  const topics =
    options.topics ??
    (options.lastUserMessage
      ? mergeTopics(options.lastUserMessage, options.intention)
      : topicsFromIntention(options.intention));

  const hasSpread = user.cards.length >= 3;

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

  const formatBlock = (() => {
    if (character === "numerolog") {
      return thematicReading ? THEMATIC_SPREAD_READING_RULES : RESPONSE_FORMAT;
    }
    if (tarotRune) {
      const theater = TAROT_RUNE_THEATER_BAN;
      if (mode === "chat") return `${theater}\n${TAROT_RUNE_CHAT_FORMAT}`;
      if (thematicReading) return `${theater}\n${TAROT_RUNE_THEMATIC_READING_RULES}`;
      return `${theater}\n${TAROT_RUNE_MARKDOWN_FORMAT}`;
    }
    return thematicReading ? THEMATIC_SPREAD_READING_RULES : RESPONSE_FORMAT;
  })();

  const spreadFinalBlock =
    hasSpread && user.isPaid && mode === "reading" && !tarotRune
      ? SPREAD_FINAL_CONCLUSION_RULES
      : "";

  const parts = [
    persona,
    numerologyBlock,
    CONTEXT_RULES,
    SPREAD_TRUTH_RULES,
    ...(hasSpread ? [CARD_GROUNDED_READING_RULES] : []),
    clientBlock(user, character, options.lastUserMessage),
    buildGenderPronounBlock(user, options.lastUserMessage),
    buildMemoryBlock(user.memory ?? [], displayName),
    buildTopicBlock(character, topics),
    paywallRule(user.isPaid),
    mode === "chat"
      ? "РЕЖИМ: живой чат — отвечай на последний вопрос клиента, сохраняя голос мастера."
      : thematicReading
        ? "РЕЖИМ: оплаченный тематический расклад — максимальная глубина по теме, без воды."
        : "РЕЖИМ: полный расклад — дай развёрнутую расшифровку трёх символов.",
    formatBlock,
    spreadFinalBlock,
    mode === "reading" && hasSpread ? getSpreadInstructions(character) : "",
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
  extras?: { sessionNumber?: number; memory?: SessionMemory[]; lastUserMessage?: string }
): { character: CharacterKey; user: PromptUserContext; lastUserMessage?: string } {
  const character: CharacterKey = isCharacterKey(characterId) ? characterId : "ragnar";
  const cards: ReadingCard[] =
    ctx.tarotCards?.slice(0, 3).map((c) => ({
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
