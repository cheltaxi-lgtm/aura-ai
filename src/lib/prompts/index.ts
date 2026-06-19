import { lifeFocusLabel, type LifeFocus } from "@/lib/astro-profile";

import { ANSWER_STRUCTURE, CONTEXT_RULES, FORBIDDEN_PATTERNS, RESPONSE_FORMAT } from "./format";
import { AGAFYA_PERSONA } from "./masters/agafya";
import { RAGNAR_PERSONA } from "./masters/ragnar";
import { SHRI_RAJ_PERSONA } from "./masters/shri-raj";
import { VERONIKA_PERSONA } from "./masters/veronika";
import { buildMemoryBlock } from "./memory";
import { buildTopicBlock, detectTopics, type TopicKey } from "./topics";
import type { CharacterKey, PromptUserContext, ReadingCard, SessionMemory } from "./types";

const MASTER_PERSONA: Record<CharacterKey, string> = {
  ragnar: RAGNAR_PERSONA,
  veronika: VERONIKA_PERSONA,
  agafya: AGAFYA_PERSONA,
  "shri-raj": SHRI_RAJ_PERSONA,
};

const MASTER_DISPLAY: Record<CharacterKey, string> = {
  ragnar: "Рагнар Хрёгвидссон",
  veronika: "Вероника Лунная",
  agafya: "Баба Агафья",
  "shri-raj": "Гуру Шри Радж Кumar",
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

function cardsBlock(cards: string[] | ReadingCard[], labels = ["Прошлое", "Настоящее", "Будущее"]): string {
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

function clientBlock(user: PromptUserContext): string {
  const sessionLabel = user.sessionNumber && user.sessionNumber > 1
    ? `Это ${user.sessionNumber}-й сеанс с этим клиентом.`
    : "Первый или ранний сеанс — заложи доверие и глубину.";

  return `
ДАННЫЕ КЛИЕНТА:
- Имя: ${user.name} (обращайся по имени минимум дважды)
- Пол: ${user.gender ?? "не указан"}
- Знак зодиака: ${user.zodiac}
- Дата рождения: ${user.birthDate}
${user.today ? `- Сегодня: ${user.today}` : ""}
- ${sessionLabel}

ВЫПАВШИЕ СИМВОЛЫ (читай как единую картину):
${cardsBlock(user.cards)}
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
}

export function buildSystemPrompt(
  character: CharacterKey,
  user: PromptUserContext,
  options: BuildPromptOptions = {}
): string {
  const mode = options.mode ?? "chat";
  const persona = MASTER_PERSONA[character];
  const displayName = MASTER_DISPLAY[character];

  const topics =
    options.topics ??
    (options.lastUserMessage ? detectTopics(options.lastUserMessage) : []);

  const parts = [
    persona,
    FORBIDDEN_PATTERNS,
    ANSWER_STRUCTURE,
    CONTEXT_RULES,
    clientBlock(user),
    buildMemoryBlock(user.memory ?? [], displayName),
    buildTopicBlock(character, topics),
    paywallRule(user.isPaid),
    mode === "chat"
      ? "РЕЖИМ: живой чат — отвечай на последний вопрос клиента, сохраняя голос мастера."
      : "РЕЖИМ: полный расклад — дай развёрнутую расшифровку трёх символов.",
    RESPONSE_FORMAT,
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
  const cards =
    ctx.tarotCards?.map((c) => c.name) ??
    ([] as string[]);

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
