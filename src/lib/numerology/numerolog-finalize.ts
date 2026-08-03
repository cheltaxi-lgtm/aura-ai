import { getNatalModel } from "@/lib/ai-model";
import { resolveReadingModelChain } from "@/lib/reading-ai-rescue";
import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { normalizePersonDisplayName } from "@/lib/normalize-person-name";
import {
  normalizeClientTyAddress,
  softenShoutyClientName,
} from "@/lib/reading-quality-gate";
import { getSetting } from "@/lib/settings";
import {
  NUMEROLOG_MAIN_READING_SYSTEM_PROMPT,
  NUMEROLOG_MATRIX_SYSTEM_PROMPT,
  NUMEROLOG_SPREAD_THREE_SYSTEM_PROMPT,
} from "@/lib/prompts/masters/numerolog";
import { buildDateAnchorBlock, todayLabelRu } from "@/lib/prompt-date";
import {
  buildClientGenderInstruction,
  genderLabelRu,
  resolveClientGender,
  type BinaryGender,
} from "@/lib/russian-name-gender";

import {
  appendNumerologFinale,
  isUnusableRussianLlmOutput,
  NUMEROLOG_FINALE_HEADER,
  polishNumerologClientReply,
  stripProstymiSlovamiSection,
  deniesHavingSpreadNumbers,
} from "./numerolog-finale-client";

export { appendNumerologFinale, NUMEROLOG_FINALE_HEADER, stripProstymiSlovamiSection, polishNumerologClientReply };

import type { NumerologyTopic } from "./topic-handlers";
export type NumerologFinaleTopic = NumerologyTopic | "spread_opening";

const TOPIC_LABELS: Partial<Record<NumerologFinaleTopic, string>> = {
  spread_opening: "расклад из трёх чисел",
  life_path: "число жизненного пути",
  pythagoras_square: "квадрат Пифагора",
  destiny_matrix: "матрица судьбы (22 аркана)",
  sphere_health: "здоровье",
  sphere_finance: "финансы",
  sphere_relations: "отношения",
  personal_cycle: "личный цикл",
  karma: "карма",
  forecast_timeline: "прогноз на 9 лет",
  favorable_dates: "удачные даты",
  chaldean: "халдейская нумерология",
  object_number: "число объекта",
  compatibility: "совместимость",
  matrix_compatibility: "совместимость матриц судьбы",
};

const MAIN_READING_INSTRUCTIONS: Partial<Record<NumerologFinaleTopic, string>> = {
  life_path:
    "Клиент спрашивает о себе, своём пути или предназначении. Свяжи число пути с его вопросом.",
  sphere_health:
    "Клиент спрашивает о здоровье, стрессе, самочувствии. Свяжи ячейки 1–3 матрицы с его симптомами и ситуацией.",
  sphere_finance:
    "Клиент спрашивает о деньгах, работе, карьере. Свяжи ячейки 4–6 и число пути с его ситуацией.",
  sphere_relations:
    "Клиент спрашивает об отношениях, семье, партнёре. Свяжи ячейки 1, 2, 6 с его вопросом.",
  pythagoras_square:
    "Дай цельный портрет по квадрату Пифагора в контексте вопроса клиента.",
  destiny_matrix:
    "Полный премиальный разбор матрицы. Сначала 2–3 тёплых предложения-вступления. Затем все 11 точек по порядку, каждая — 4–6 предложений + своя «Практика:». Не схлопывай точки с одинаковым арканом и не копируй практики. Только «ты», имя обычным регистром. Без пифагорейских чисел. В конце 3–5 разных шагов на 30 дней без markdown.",
  matrix_compatibility:
    "Разбор совместимости двух матриц. Вступление 2–3 предложения, затем 5 ключей (комфорт, отношения, деньги, хвост, год) — у каждого своя практика. В конце общий совет на 30 дней. Без markdown и без пересчёта арканов.",
  spread_opening:
    "Клиент вытянул три числа на период. Свяжи каждую позицию с числом пути и личным годом. Не перечисляй ячейки матрицы.",
};

const SPREAD_OPENING_USER_HINT =
  "Пользователь вытянул три числа на текущий период. Дай глубокий связный анализ — не копируй факты движка дословно.";

/** Avoid showing mid-word LLM cutoffs when the provider hits max_tokens. */
function trimIncompleteTrailingSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.!?…»"')\]]$/.test(t)) return t;

  const lastEnd = Math.max(
    t.lastIndexOf(". "),
    t.lastIndexOf("! "),
    t.lastIndexOf("? "),
    t.lastIndexOf("… ")
  );
  if (lastEnd >= Math.floor(t.length * 0.45)) {
    return t.slice(0, lastEnd + 1).trim();
  }
  return t;
}

function isProseLikelyTruncated(text: string): boolean {
  const t = text.trim();
  if (t.length < 48) return false;
  if (/[.!?…»"')\]]$/.test(t)) return false;
  return true;
}

function normalizeProseChunk(text: string): string {
  return text.trim().replace(/^["«]|["»]$/g, "");
}

function mergeProseContinuation(prev: string, next: string): string {
  let a = prev.trimEnd();
  let b = next.trimStart();
  if (!b) return a;
  if (!a) return b;

  for (let len = Math.min(a.length, b.length, 120); len >= 4; len--) {
    if (a.slice(-len) === b.slice(0, len)) {
      return a + b.slice(len);
    }
  }

  const sectionRestart =
    /^(?:\*\*)?(?:Совет чисел|Энергия периода|Число пути)\s*—/i;
  if (sectionRestart.test(b) && !/[.!?…»"')\s]$/.test(a)) {
    const cut = a.lastIndexOf(" ");
    if (cut > Math.floor(a.length * 0.45)) {
      a = a.slice(0, cut).trimEnd();
    }
  }

  const gap = /[.!?…]$/.test(a) ? " " : a.endsWith(",") || a.endsWith(";") ? " " : " ";
  return `${a}${gap}${b}`;
}

const MAIN_READING_MAX_TOKENS: Partial<Record<NumerologFinaleTopic, number>> = {
  spread_opening: 1800,
  // Full matrix = ~15–18 zones × 4–6 sentences; 2800 was cutting mid-report.
  destiny_matrix: 4200,
  forecast_timeline: 1400,
  pythagoras_square: 1200,
  life_path: 1100,
};

const FINALE_MAX_TOKENS: Partial<Record<NumerologFinaleTopic, number>> = {
  spread_opening: 960,
  destiny_matrix: 420,
  forecast_timeline: 420,
  pythagoras_square: 360,
};

async function readingTokenBudget(kind: "main" | "finale", topic: NumerologFinaleTopic): Promise<number> {
  let base = 900;
  try {
    const ai = await getSetting("ai");
    base = Number(ai.maxReadingTokens) || 900;
  } catch {
    /* defaults */
  }

  if (kind === "main") {
    const floor = MAIN_READING_MAX_TOKENS[topic] ?? 1100;
    const budget = Math.max(floor, Math.round(base * 1.75));
    // Cap matrix: enough for all zones; avoid MiMo-style 8k+ CoT burn.
    if (topic === "destiny_matrix") return Math.min(budget, 5200);
    return budget;
  }

  const floor = FINALE_MAX_TOKENS[topic] ?? (topic === "spread_opening" ? 960 : 320);
  return Math.max(floor, Math.round(base * 1.05));
}

const CONTINUE_USER_PROMPT =
  "Текст оборвался на лимите. Продолжи ровно с того места, где остановилась — без повтора уже написанного. Допиши до логического завершения (1–4 предложения). Заверши последнее предложение точкой.";

type NumerologProseOpts = {
  maxTokens: number;
  temperature: number;
  /** Prefer paidModel → fallbackModels (MiMo often returns content:null). */
  isPaid?: boolean;
  /** Long matrix readings need more than the default 90s. */
  timeoutMs?: number;
  /**
   * Skip models that leak the answer into reasoning (MiMo).
   * Used for destiny_matrix — OpenRouter shows finish:length with content:null.
   */
  skipReasoningLeakModels?: boolean;
  /** Extra continue passes + custom continue prompt (destiny_matrix). */
  topic?: NumerologFinaleTopic;
};

function isReasoningLeakModelId(model: string | undefined): boolean {
  return Boolean(model && model.toLowerCase().includes("mimo"));
}

/**
 * Complete prose with auto-continuation when the model hits max_tokens.
 * Walks admin model chain so empty MiMo reasoning falls through to DeepSeek etc.
 */
async function completeNumerologProse(
  initialMessages: ChatMessage[],
  opts: NumerologProseOpts
): Promise<string | null> {
  const { matrixMissingSections, matrixContinuePrompt, isCompleteMatrixReading } =
    await import("@/lib/numerology/matrix-completeness");

  let models = await resolveReadingModelChain(opts.isPaid !== false);
  if (opts.skipReasoningLeakModels) {
    const filtered = models.filter((m) => !isReasoningLeakModelId(m));
    // Keep DeepSeek (etc.) first; only fall back to MiMo if nothing else is configured.
    models = filtered.length > 0 ? filtered : models;
    // Fast backup when DeepSeek is rate-limited (common on OpenRouter).
    try {
      const natal = (await getNatalModel()).trim();
      if (natal && !isReasoningLeakModelId(natal) && !models.includes(natal)) {
        models = [...models, natal];
      }
    } catch {
      /* ignore */
    }
  }
  const chain: Array<string | undefined> = models.length > 0 ? models : [undefined];
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const isMatrix = opts.topic === "destiny_matrix";
  const maxPass = isMatrix ? 5 : 2;

  for (let modelIndex = 0; modelIndex < chain.length; modelIndex++) {
    const modelOverride = chain[modelIndex];
    const messages: ChatMessage[] = [...initialMessages];
    let combined = "";
    // MiMo empty-content burns ~55s×attempts — one shot then failover.
    const maxAttempts = isReasoningLeakModelId(modelOverride) ? 1 : modelIndex === 0 ? 2 : 1;

    for (let pass = 0; pass <= maxPass; pass++) {
      const result = await completeChatDetailed({
        messages,
        maxTokens: opts.maxTokens + pass * (isMatrix ? 700 : 500),
        temperature: opts.temperature,
        isPaid: opts.isPaid !== false,
        modelOverride,
        timeoutMs,
        maxAttempts,
        skipTemperatureRetry: modelIndex > 0 || isReasoningLeakModelId(modelOverride),
      });

      const chunk = normalizeProseChunk(result.text ?? "");
      if (!chunk) {
        if (result.finishReason === "length") {
          console.warn(
            "[numerolog] empty content with finish=length (likely reasoning burn):",
            modelOverride || "(default)"
          );
        }
        break;
      }

      combined = combined ? mergeProseContinuation(combined, chunk) : chunk;

      const missing = isMatrix ? matrixMissingSections(combined) : [];
      const matrixIncomplete = isMatrix && !isCompleteMatrixReading(combined);
      const needsMore =
        result.finishReason === "length" ||
        isProseLikelyTruncated(combined) ||
        matrixIncomplete;
      if (!needsMore) {
        if (modelIndex > 0) {
          console.info(
            "[numerolog] prose recovered via fallback model:",
            modelOverride
          );
        }
        return combined;
      }
      if (pass >= maxPass) break;

      const continuePrompt =
        isMatrix && missing.length
          ? matrixContinuePrompt(missing)
          : CONTINUE_USER_PROMPT;
      messages.push({ role: "assistant", content: combined });
      messages.push({ role: "user", content: continuePrompt });
    }

    if (combined) {
      if (isMatrix && !isCompleteMatrixReading(combined)) {
        console.warn(
          "[numerolog] matrix still incomplete after continues:",
          matrixMissingSections(combined).join(", ")
        );
        // Do not accept incomplete matrix from this model — try next fallback.
        if (modelIndex < chain.length - 1) {
          combined = "";
          continue;
        }
        return null;
      }
      if (modelIndex > 0) {
        console.info(
          "[numerolog] prose recovered via fallback model:",
          modelOverride
        );
      }
      return trimIncompleteTrailingSentence(combined);
    }

    if (modelIndex < chain.length - 1) {
      console.warn(
        "[numerolog] empty prose from model, trying fallback:",
        modelOverride || "(default)"
      );
    }
  }

  return null;
}

function deterministicFinale(name: string, topic: NumerologFinaleTopic): string {
  const label = TOPIC_LABELS[topic] ?? "разбор";
  if (topic === "spread_opening") {
    return `${name}, три числа — это акцент ближайшего периода, не «новая судьба». Опирайся на них в решениях, а полный квадрат Пифагора можно запросить отдельно.`;
  }
  if (topic === "forecast_timeline") {
    return `${name}, девять лет — один большой цикл: в начале закладываешь фундамент, в середине строишь и меняешь, в конце подводишь итоги. Смотри на личный год как на фон, а не как приговор.`;
  }
  if (topic === "life_path") {
    return `${name}, если коротко: твоё число пути — это твой способ идти по жизни. Опирайся на сильные качества, а слабые зоны подкрепляй простыми привычками, а не рывками.`;
  }
  if (topic === "destiny_matrix") {
    return `${name}, если коротко: твоя матрица — карта склонностей, не приговор. Опирайся на ось предназначения и аркан года, а слабые зоны закрывай простыми шагами, а не рывками.`;
  }
  return `${name}, если коротко: это твой ${label}. Опирайся на сильные показатели, слабые зоны подкрепляй простыми привычками, а не рывками.`;
}

const FINALE_INSTRUCTIONS: Partial<Record<NumerologFinaleTopic, string>> = {
  spread_opening:
    "Объясни расклад из трёх чисел максимально понятно и подробно: что означает число пути, энергия периода и совет — по одному абзацу на каждую позицию. Свяжи их в общую картину ближайшего времени. Если в данных есть число жизненного пути или личный год — упомяни, как расклад с ними перекликается. Не перечисляй ячейки матрицы и не упоминай квадрат Пифагора. Сегодняшняя дата указана в данных — не называй прошедшие события «ближайшими» или «на носу».",
  forecast_timeline:
    "Не перечисляй годы списком. Дай общую дугу цикла на 9 лет: где старт, где пик нагрузки, где завершение. Один практический совет.",
  karma: "Сформулируй главный урок кармы простым языком, без перечисления всех цифр.",
  pythagoras_square:
    "Собери образ человека: опора, урок, один совет. Без перечисления всех ячеек.",
  life_path:
    "Один практический совет на ближайшее время, опираясь на число пути и личный год. Не повторяй весь разбор.",
  destiny_matrix:
    "Только блок КЛЮЧИ ДЛЯ РЕЗЮМЕ: опора характера, предназначение, деньги, аркан года — дословно эти четыре аркана. Аркан года нельзя подменять Отшельником/Силой/другой точкой. Без пути/души/личности и без квадрата Пифагора.",
};

/**
 * Warm main reading from engine facts — LLM prose only.
 * Returns null when AI fails (callers must not treat engine fallback as AI success).
 */
function polishMatrixClientReply(text: string, displayName: string): string {
  let out = polishNumerologClientReply(text);
  out = normalizeClientTyAddress(out);
  out = softenShoutyClientName(out, displayName);
  // Common polite plurals that slip past вы→ты word swap.
  out = out
    .replace(/(?<!\p{L})усиливайте(?!\p{L})/giu, "усиливай")
    .replace(/(?<!\p{L})освойте(?!\p{L})/giu, "освой")
    .replace(/(?<!\p{L})делайте(?!\p{L})/giu, "делай")
    .replace(/(?<!\p{L})помните(?!\p{L})/giu, "помни")
    .replace(/(?<!\p{L})смотрите(?!\p{L})/giu, "смотри");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export async function generateNumerologMainReading(params: {
  name: string;
  topic: NumerologFinaleTopic;
  userMessage: string;
  engineFacts: string;
  /** @deprecated ignored for success path — kept for call-site compatibility */
  fallback?: string;
  gender?: string | null;
  /** When true, return engine fallback string instead of null (free chips only). */
  allowEngineFallback?: boolean;
}): Promise<string | null> {
  const displayName =
    normalizePersonDisplayName(params.name) || params.name.trim() || "друг";
  const factsCap = params.topic === "destiny_matrix" ? 6500 : 4000;
  const facts = params.engineFacts.trim().slice(0, factsCap);
  if (!facts) {
    return params.allowEngineFallback ? params.fallback ?? null : null;
  }

  const topicLabel = TOPIC_LABELS[params.topic] ?? params.topic;
  const extra = MAIN_READING_INSTRUCTIONS[params.topic] ?? "";
  const question =
    params.topic === "spread_opening"
      ? SPREAD_OPENING_USER_HINT
      : params.userMessage.trim().slice(0, 800);
  const gender: BinaryGender | null = resolveClientGender(params.gender, displayName);
  const genderBlock = buildClientGenderInstruction({
    gender,
    firstName: displayName,
  });

  const systemBase =
    params.topic === "spread_opening"
      ? NUMEROLOG_SPREAD_THREE_SYSTEM_PROMPT
      : params.topic === "destiny_matrix"
        ? NUMEROLOG_MATRIX_SYSTEM_PROMPT
        : NUMEROLOG_MAIN_READING_SYSTEM_PROMPT;

  const text = await completeNumerologProse(
    [
      {
        role: "system",
        content: [
          systemBase,
          genderBlock,
          buildDateAnchorBlock(),
          extra,
          `Фокус расчёта: ${topicLabel}.`,
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        role: "user",
        content: [
          `Имя клиента (именительный падеж, обычный регистр): ${displayName}`,
          gender
            ? `Пол клиента: ${genderLabelRu(gender)}. Согласуй весь текст с этим полом.`
            : "Пол клиента не указан — нейтральное «ты».",
          `Сегодня: ${todayLabelRu()}.`,
          question ? `Вопрос клиента: «${question}»` : "",
          `\nДАННЫЕ ДВИЖКА:\n${facts}`,
          params.topic === "destiny_matrix"
            ? `\nНапиши полный разбор матрицы по ВСЕМ зонам из правила 5 (до Шагов на 30 дней). Обращайся «${displayName}» (не капсом). Только «ты». Каждая точка — 4–6 предложений + своя Практика. Не копируй фразы между точками. Без пифагорейских чисел. Не пиши «Простыми словами» и не сокращай в резюме.`
            : "\nДай связный ответ на вопрос клиента, опираясь только на эти факты.",
          "События с датой раньше «Сегодня» не выделяй как актуальный фокус недели — говори о текущем периоде.",
          "Завершай каждое предложение полностью — не обрывай текст на полуслове.",
          "Без markdown: не используй *, **, # и заголовки.",
          // MiMo often spends the whole budget in English CoT with content:null —
          // force the answer into the content field.
          "Ответ пиши только в content (основном тексте сообщения). Не оставляй content пустым.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    {
      maxTokens: await readingTokenBudget("main", params.topic),
      temperature: params.topic === "destiny_matrix" ? 0.45 : 0.58,
      isPaid: true,
      timeoutMs: params.topic === "destiny_matrix" ? 180_000 : 100_000,
      skipReasoningLeakModels: params.topic === "destiny_matrix",
      topic: params.topic,
    }
  );

  const trimmed = normalizeProseChunk(text ?? "");
  if (!trimmed || trimmed.length < 80 || isUnusableRussianLlmOutput(trimmed, 40)) {
    return params.allowEngineFallback ? params.fallback ?? null : null;
  }
  if (/только движком|что разобрать\?/i.test(trimmed)) {
    return params.allowEngineFallback
      ? polishNumerologClientReply(params.fallback ?? "")
      : null;
  }
  if (params.topic === "spread_opening" && deniesHavingSpreadNumbers(trimmed)) {
    return params.allowEngineFallback ? params.fallback ?? null : null;
  }
  if (params.topic === "destiny_matrix") {
    const { isUsableMatrixReading, sanitizeReadingForClient } = await import(
      "@/lib/chat-reply-sanitize"
    );
    const cleaned = sanitizeReadingForClient(trimmed);
    if (cleaned && isUsableMatrixReading(trimmed)) {
      return polishMatrixClientReply(cleaned, displayName);
    }
    // LLM returned unusable/leaked text — prefer engine only when caller allows it
    // and the fallback itself passes the same client-safety bar.
    if (params.allowEngineFallback && params.fallback?.trim()) {
      const engineClean = sanitizeReadingForClient(params.fallback);
      if (engineClean && isUsableMatrixReading(params.fallback)) {
        return polishMatrixClientReply(engineClean, displayName);
      }
    }
    return null;
  }
  return polishNumerologClientReply(normalizeClientTyAddress(trimmed));
}

/** Short LLM finale in plain Russian — facts from engine only. */
export async function generateNumerologFinale(params: {
  name: string;
  topic: NumerologFinaleTopic;
  engineFacts: string;
  gender?: string | null;
}): Promise<string> {
  const facts = params.engineFacts.trim().slice(0, 2500);
  if (!facts) return deterministicFinale(params.name, params.topic);

  const topicLabel = TOPIC_LABELS[params.topic] ?? params.topic;
  const extra = FINALE_INSTRUCTIONS[params.topic] ?? "";
  const isSpreadOpening = params.topic === "spread_opening";
  const gender = resolveClientGender(params.gender, params.name);
  const genderBlock = buildClientGenderInstruction({
    gender,
    firstName: params.name,
  });

  const text = await completeNumerologProse(
    [
      {
        role: "system",
        content: [
          "Ты — нумеролог Эвелина. Пиши тёпло, по-человечески, обращаясь по имени.",
          genderBlock,
          isSpreadOpening
            ? "5–7 предложений связным текстом: подробно, но простым языком, без канцелярита."
            : "Напиши 3–4 коротких предложения простым русским языком.",
          "Ответ СТРОГО на русском — без английского, китайского и отказов вроде «я языковая модель».",
          "Используй ТОЛЬКО факты из блока ДАННЫЕ ДВИЖКА. Не выдумывай числа, даты и ячейки.",
          "Без заголовков, списков и markdown (#, *, _). Не повторяй дословно весь разбор и не копируй списки годов.",
          "Не пиши заголовок «Простыми словами» — его добавит система.",
          "Завершай каждое предложение полностью — не обрывай текст на полуслове.",
          buildDateAnchorBlock(),
          `Тема: ${topicLabel}.`,
          extra,
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        role: "user",
        content: [
          `Имя клиента (именительный падеж): ${params.name}`,
          gender
            ? `Пол клиента: ${genderLabelRu(gender)}. Согласуй род.`
            : "Пол не указан — нейтральное «ты».",
          `Сегодня: ${todayLabelRu()}.`,
          `\nДАННЫЕ ДВИЖКА:\n${facts}`,
          isSpreadOpening
            ? "\nОбъясни расклад простыми словами: что означает каждое из трёх чисел и как они работают вместе. Не называй прошедшие события «ближайшими»."
            : "\nРезюмируй человеку простыми словами.",
        ].join("\n"),
      },
    ],
    {
      maxTokens: await readingTokenBudget("finale", params.topic),
      temperature: isSpreadOpening ? 0.5 : 0.35,
    }
  );

  const trimmed = normalizeProseChunk(text ?? "");
  const minLen = isSpreadOpening ? 80 : 20;
  const minCyrillic = isSpreadOpening ? 40 : 15;
  if (!trimmed || trimmed.length < minLen || isUnusableRussianLlmOutput(trimmed, minCyrillic)) {
    return polishNumerologClientReply(deterministicFinale(params.name, params.topic));
  }
  return polishNumerologClientReply(trimmed);
}
