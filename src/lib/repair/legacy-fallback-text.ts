/**
 * Deterministic legacy fallback text — repair / quality-regression tooling only.
 * Must never be called from paid production success paths.
 */
import { buildNumerologSpreadReading } from "@/lib/numerolog/welcome";
import { getSessionTopic, type SessionTopicId } from "@/lib/session-topics";
import {
  normalizeSpreadId,
  requiredCardCount,
  resolveSpreadPositions,
} from "@/lib/spreads";

const FALLBACK_READINGS: Record<
  string,
  (ctx: { userName: string; isPaid: boolean }) => string
> = {
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
  ctx: {
    userName: string;
    isPaid: boolean;
    tarotCards?: { name: string; meaning?: string }[];
    intention?: string | null;
  }
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

export function photoReadingFallback(userName?: string): string {
  const name = userName ?? "друг";
  return `${name}, связь с образом прервалась — не могу сейчас расшифровать расклад. Руны возвращены на баланс. Попробуйте ещё раз с более чётким фото: все карты целиком в кадре, без бликов, сверху. Или соберите расклад вручную в фото-режиме.`;
}
