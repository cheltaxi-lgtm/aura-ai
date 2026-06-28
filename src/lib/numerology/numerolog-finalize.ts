import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import { getSetting } from "@/lib/settings";
import { NUMEROLOG_MAIN_READING_SYSTEM_PROMPT, NUMEROLOG_SPREAD_THREE_SYSTEM_PROMPT } from "@/lib/prompts/masters/numerolog";

import {
  appendNumerologFinale,
  isUnusableRussianLlmOutput,
  NUMEROLOG_FINALE_HEADER,
  stripProstymiSlovamiSection,
} from "./numerolog-finale-client";

export { appendNumerologFinale, NUMEROLOG_FINALE_HEADER, stripProstymiSlovamiSection };

import type { NumerologyTopic } from "./topic-handlers";
export type NumerologFinaleTopic = NumerologyTopic | "spread_opening";

const TOPIC_LABELS: Partial<Record<NumerologFinaleTopic, string>> = {
  spread_opening: "расклад из трёх чисел",
  life_path: "число жизненного пути",
  pythagoras_square: "квадрат Пифагора",
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

const MAIN_READING_MAX_TOKENS: Partial<Record<NumerologFinaleTopic, number>> = {
  spread_opening: 1800,
  forecast_timeline: 1400,
  pythagoras_square: 1200,
  life_path: 1100,
};

const FINALE_MAX_TOKENS: Partial<Record<NumerologFinaleTopic, number>> = {
  spread_opening: 960,
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
    return Math.max(floor, Math.round(base * 1.75));
  }

  const floor = FINALE_MAX_TOKENS[topic] ?? (topic === "spread_opening" ? 960 : 320);
  return Math.max(floor, Math.round(base * 1.05));
}

const CONTINUE_USER_PROMPT =
  "Текст оборвался на лимите. Продолжи ровно с того места, где остановилась — без повтора уже написанного. Допиши до логического завершения (1–4 предложения). Заверши последнее предложение точкой.";

/** Complete prose with auto-continuation when the model hits max_tokens. */
async function completeNumerologProse(
  initialMessages: ChatMessage[],
  opts: { maxTokens: number; temperature: number }
): Promise<string | null> {
  const messages: ChatMessage[] = [...initialMessages];
  let combined = "";

  for (let pass = 0; pass <= 2; pass++) {
    const result = await completeChatDetailed({
      messages,
      maxTokens: opts.maxTokens + pass * 500,
      temperature: opts.temperature,
    });

    const chunk = normalizeProseChunk(result.text ?? "");
    if (!chunk) break;

    combined = combined ? `${combined}${chunk}` : chunk;

    const needsMore =
      result.finishReason === "length" || isProseLikelyTruncated(combined);
    if (!needsMore) {
      return combined;
    }
    if (pass >= 2) break;

    messages.push({ role: "assistant", content: combined });
    messages.push({ role: "user", content: CONTINUE_USER_PROMPT });
  }

  return combined ? trimIncompleteTrailingSentence(combined) : null;
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
  return `${name}, если коротко: это твой ${label}. Опирайся на сильные показатели, слабые зоны подкрепляй простыми привычками, а не рывками.`;
}

const FINALE_INSTRUCTIONS: Partial<Record<NumerologFinaleTopic, string>> = {
  spread_opening:
    "Объясни расклад из трёх чисел максимально понятно и подробно: что означает число пути, энергия периода и совет — по одному абзацу на каждую позицию. Свяжи их в общую картину ближайшего времени. Если в данных есть число жизненного пути или личный год — упомяни, как расклад с ними перекликается. Не перечисляй ячейки матрицы и не упоминай квадрат Пифагора.",
  forecast_timeline:
    "Не перечисляй годы списком. Дай общую дугу цикла на 9 лет: где старт, где пик нагрузки, где завершение. Один практический совет.",
  karma: "Сформулируй главный урок кармы простым языком, без перечисления всех цифр.",
  pythagoras_square:
    "Собери образ человека: опора, урок, один совет. Без перечисления всех ячеек.",
  life_path:
    "Один практический совет на ближайшее время, опираясь на число пути и личный год. Не повторяй весь разбор.",
};

/** Warm main reading from engine facts — LLM prose adapted to the user's question. */
export async function generateNumerologMainReading(params: {
  name: string;
  topic: NumerologFinaleTopic;
  userMessage: string;
  engineFacts: string;
  fallback: string;
}): Promise<string> {
  const facts = params.engineFacts.trim().slice(0, 4000);
  if (!facts) return params.fallback;

  const topicLabel = TOPIC_LABELS[params.topic] ?? params.topic;
  const extra = MAIN_READING_INSTRUCTIONS[params.topic] ?? "";
  const question =
    params.topic === "spread_opening"
      ? SPREAD_OPENING_USER_HINT
      : params.userMessage.trim().slice(0, 800);

  const systemBase =
    params.topic === "spread_opening"
      ? NUMEROLOG_SPREAD_THREE_SYSTEM_PROMPT
      : NUMEROLOG_MAIN_READING_SYSTEM_PROMPT;

  const text = await completeNumerologProse(
    [
      {
        role: "system",
        content: [systemBase, extra, `Фокус расчёта: ${topicLabel}.`]
          .filter(Boolean)
          .join(" "),
      },
      {
        role: "user",
        content: [
          `Имя клиента: ${params.name}`,
          question ? `Вопрос клиента: «${question}»` : "",
          `\nДАННЫЕ ДВИЖКА:\n${facts}`,
          "\nДай связный ответ на вопрос клиента, опираясь только на эти факты.",
          "Завершай каждое предложение полностью — не обрывай текст на полуслове.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    {
      maxTokens: await readingTokenBudget("main", params.topic),
      temperature: 0.58,
    }
  );

  const trimmed = normalizeProseChunk(text ?? "");
  if (!trimmed || trimmed.length < 80 || isUnusableRussianLlmOutput(trimmed, 40)) {
    return params.fallback;
  }
  if (/только движком|что разобрать\?/i.test(trimmed)) {
    return params.fallback;
  }
  return trimmed;
}

/** Short LLM finale in plain Russian — facts from engine only. */
export async function generateNumerologFinale(params: {
  name: string;
  topic: NumerologFinaleTopic;
  engineFacts: string;
}): Promise<string> {
  const facts = params.engineFacts.trim().slice(0, 2500);
  if (!facts) return deterministicFinale(params.name, params.topic);

  const topicLabel = TOPIC_LABELS[params.topic] ?? params.topic;
  const extra = FINALE_INSTRUCTIONS[params.topic] ?? "";
  const isSpreadOpening = params.topic === "spread_opening";

  const text = await completeNumerologProse(
    [
      {
        role: "system",
        content: [
          "Ты — нумеролог Эвелина. Пиши тёпло, по-человечески, обращаясь по имени.",
          isSpreadOpening
            ? "5–7 предложений связным текстом: подробно, но простым языком, без канцелярита."
            : "Напиши 3–4 коротких предложения простым русским языком.",
          "Ответ СТРОГО на русском — без английского, китайского и отказов вроде «я языковая модель».",
          "Используй ТОЛЬКО факты из блока ДАННЫЕ ДВИЖКА. Не выдумывай числа, даты и ячейки.",
          "Без заголовков, списков и markdown (#, *, _). Не повторяй дословно весь разбор и не копируй списки годов.",
          "Не пиши заголовок «Простыми словами» — его добавит система.",
          "Завершай каждое предложение полностью — не обрывай текст на полуслове.",
          `Тема: ${topicLabel}.`,
          extra,
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        role: "user",
        content: `Имя клиента: ${params.name}\n\nДАННЫЕ ДВИЖКА:\n${facts}\n\n${
          isSpreadOpening
            ? "Объясни расклад простыми словами: что означает каждое из трёх чисел и как они работают вместе."
            : "Резюмируй человеку простыми словами."
        }`,
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
    return deterministicFinale(params.name, params.topic);
  }
  return trimmed;
}
