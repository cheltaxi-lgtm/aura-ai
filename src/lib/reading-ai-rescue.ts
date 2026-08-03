import { getAdminAiSettings, getChatModel } from "@/lib/ai-model";
import { missingCardMentions } from "@/lib/chat-reply-sanitize";
import { completeChatDetailed, type ChatMessage } from "@/lib/llm";

/**
 * Last-resort AI rescue for paid spreads.
 * Every stage still calls the LLM — no template prose ever reaches the client.
 */

export type RescueCard = {
  name: string;
  position: string;
  meaning?: string;
};

const VOICE_HINTS: Record<string, string> = {
  veronika:
    "Ты — Вероника Лунная, таролог. Тёплый прямой русский, обращение на «ты», честность без утешительной ваты.",
  ragnar:
    "Ты — Рагнар, рунолог. Северная прямота, короткие рубленые фразы, ноль сантиментов.",
  agafya:
    "Ты — Агафья, деревенская ведунья. Простая образная речь, обращение «дитя», без книжных терминов.",
  "shri-raj":
    "Ты — Шри Радж. Спокойная ясность, кармическая логика причин и следствий, без экзотической мишуры.",
  gadalka_marina:
    "Ты — Марина, потомственная гадалка. Ночная доверительная интонация, конкретика вместо мистического тумана.",
  numerolog:
    "Ты — Эвелина, нумеролог. Считаешь числа и говоришь по делу, без markdown и без эзотерической воды.",
};

/** Ordered model chain for readings: paid → shared → admin fallbacks. */
export async function resolveReadingModelChain(isPaid: boolean): Promise<string[]> {
  const ai = await getAdminAiSettings();
  const primary = await getChatModel(isPaid ? "paid" : "free");
  const chain = [primary, ai.model, ...(ai.fallbackModels ?? [])];
  const out: string[] = [];
  for (const raw of chain) {
    const model = raw?.trim();
    if (model && !out.includes(model)) out.push(model);
  }
  return out;
}

function cardsBlock(cards: RescueCard[]): string {
  return cards
    .map((c, i) => {
      const meaning = c.meaning?.replace(/^[^:]+:\s*/, "").trim();
      const pos = c.position || `Позиция ${i + 1}`;
      return meaning
        ? `${i + 1}. ${pos} — «${c.name}»: ${meaning}`
        : `${i + 1}. ${pos} — «${c.name}»`;
    })
    .join("\n");
}

/**
 * Lean system prompt: keeps the master's voice and the premium bar,
 * but drops the heavy policy stack that makes small models stall or refuse.
 */
function buildLeanSystemPrompt(characterId: string, cardCount: number): string {
  const voice = VOICE_HINTS[characterId] ?? VOICE_HINTS.veronika!;
  const minWords = cardCount <= 3 ? 240 : cardCount <= 5 ? 340 : Math.max(480, cardCount * 55);
  const tarotFinale =
    characterId === "veronika" ||
    characterId === "ragnar" ||
    characterId === "agafya" ||
    characterId === "gadalka_marina"
      ? [
          "- Первая фраза — вердикт по вопросу (жёстко / в плюс / смешанно / стоит / не стоит).",
          "- Имена символов выделяй **жирным**.",
          "- В конце обязателен блок ровно с заголовком «## Простыми словами» (3–5 предложений).",
          "- К клиенту только на «ты» (ты/тебе/твой). Запрещены вы/вам/ваш/ваша/ваши.",
          "- Между вердиктом, каждым символом и финалом — пустая строка.",
        ]
      : ["- В конце — блок выводов по всему раскладу целиком."];
  return [
    voice,
    "",
    "ЗАДАЧА: написать полный платный разбор расклада.",
    "",
    "ЖЁСТКИЕ ТРЕБОВАНИЯ:",
    `- Раскрой ВСЕ ${cardCount} символов, каждый — по имени, в своей позиции.`,
    `- Объём не меньше ${minWords} слов. На каждый символ — не меньше 4 предложений: имя → смысл здесь → вывод по вопросу.`,
    "- Отвечай на заданный вопрос прямо, по доминанте символов. Тема войны, болезни, смерти, расставания — не повод уходить в общие слова.",
    "- Запрещено: «энергии», «вибрации», «вселенная посылает», «прислушайтесь к себе», «период трансформации» и прочая вода.",
    "- Запрещено: отказ отвечать, дисклеймеры про ИИ, советы обратиться к специалисту вместо разбора.",
    "- Ни одного выдуманного факта: только то, что следует из символов.",
    ...tarotFinale,
    "- Русский язык, законченные предложения, без обрыва на полуслове.",
  ].join("\n");
}

async function tryModel(
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  try {
    const res = await completeChatDetailed({
      messages,
      maxTokens,
      temperature,
      timeoutMs: 70_000,
      skipTemperatureRetry: true,
      allowReasoningFallback: true,
      isPaid: true,
      modelOverride: model,
    });
    return res.text?.trim() ?? "";
  } catch (err) {
    console.warn("[reading-rescue] model call failed", {
      model,
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

/**
 * Stage 1 — regenerate the whole reading from a lean prompt across the model chain.
 * Returns accepted text or the longest usable draft for stage 2.
 */
async function rescueFullReading(params: {
  characterId: string;
  userName: string;
  question: string;
  cards: RescueCard[];
  maxTokens: number;
  accept: (raw: string) => string | null;
  softAccept?: (raw: string) => string | null;
}): Promise<{ accepted: string | null; bestDraft: string }> {
  const models = await resolveReadingModelChain(true);
  const system = buildLeanSystemPrompt(params.characterId, params.cards.length);
  const user = [
    `Клиент: ${params.userName}.`,
    `Вопрос: ${params.question}`,
    "",
    "Выпавшие символы:",
    cardsBlock(params.cards),
    "",
    "Напиши разбор целиком, плотно и по делу.",
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  let bestDraft = "";
  for (const model of models) {
    for (const temperature of [0.8, 0.6]) {
      const text = await tryModel(model, messages, params.maxTokens, temperature);
      if (!text) continue;
      const accepted = params.accept(text) ?? params.softAccept?.(text) ?? null;
      if (accepted) return { accepted, bestDraft };
      if (text.length > bestDraft.length) bestDraft = text;
    }
  }
  return { accepted: null, bestDraft };
}

/**
 * Stage 2 — the draft is good but skips some symbols.
 * Ask the model to write those blocks and splice them in before the conclusion.
 */
async function graftMissingCards(params: {
  characterId: string;
  userName: string;
  question: string;
  cards: RescueCard[];
  draft: string;
  accept: (raw: string) => string | null;
}): Promise<string | null> {
  const cardNames = params.cards.map((c) => c.name);
  const missing = missingCardMentions(params.draft, cardNames);
  if (!missing.length) return null;

  const models = await resolveReadingModelChain(true);
  const missingCards = params.cards.filter((c) => missing.includes(c.name));
  const system = buildLeanSystemPrompt(params.characterId, missingCards.length);
  const user = [
    `Клиент: ${params.userName}.`,
    `Вопрос: ${params.question}`,
    "",
    "В разборе не раскрыты эти символы:",
    cardsBlock(missingCards),
    "",
    "Уже написанная часть разбора (для стыковки по смыслу и тону):",
    params.draft.slice(-1500),
    "",
    `Напиши только недостающие блоки — по одному абзацу на символ, каждый начинается с имени символа. Без вступления, без выводов, без повторов уже сказанного.`,
  ].join("\n");

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  for (const model of models) {
    const blocks = await tryModel(model, messages, 1600, 0.75);
    if (!blocks) continue;
    const merged = `${params.draft.trim()}\n\n${blocks.trim()}`;
    const accepted = params.accept(merged);
    if (accepted) return accepted;
  }
  return null;
}

/**
 * Guarantee an AI-authored paid reading.
 * Returns null only when every model in the chain failed to produce usable text.
 */
export async function rescueReadingWithAi(params: {
  characterId: string;
  userName: string;
  question: string;
  cards: RescueCard[];
  maxTokens: number;
  previousDraft?: string;
  accept: (raw: string) => string | null;
  softAccept?: (raw: string) => string | null;
}): Promise<string | null> {
  const previous = params.previousDraft?.trim() ?? "";
  const acceptOrSoft = (raw: string) =>
    params.accept(raw) ?? params.softAccept?.(raw) ?? null;

  // The earlier attempt may already be a solid reading that only skipped a symbol.
  if (previous.length >= 200) {
    const grafted = await graftMissingCards({
      characterId: params.characterId,
      userName: params.userName,
      question: params.question,
      cards: params.cards,
      draft: previous,
      accept: acceptOrSoft,
    });
    if (grafted) return grafted;
    const softPrevious = params.softAccept?.(previous);
    if (softPrevious) return softPrevious;
  }

  const { accepted, bestDraft } = await rescueFullReading(params);
  if (accepted) return accepted;

  if (bestDraft.length >= 200) {
    const grafted = await graftMissingCards({
      characterId: params.characterId,
      userName: params.userName,
      question: params.question,
      cards: params.cards,
      draft: bestDraft,
      accept: acceptOrSoft,
    });
    if (grafted) return grafted;
  }

  return params.softAccept?.(bestDraft || previous) ?? null;
}
