import {
  RITUAL_MASTER_PROMPT_STYLE,
  RITUAL_TYPES,
  isRitualMaster,
  type RitualType,
} from "@/lib/ritual-config";
import {
  buildRitualTimeString,
  computeRitualSchedule,
  formatRitualCalendarDate,
  type RitualSchedule,
} from "@/lib/ritual-timing";
import { buildDateAnchorBlock } from "@/lib/prompt-date";
import { resolveDeckCard, resolveDeckSystem } from "@/lib/deck-card-utils";

export { formatRitualCalendarDate } from "@/lib/ritual-timing";

export function buildRitualPrompt(params: {
  characterKey: string;
  ritualType: RitualType;
  userName: string;
  userZodiac: string;
  answers: string[];
  cards: Array<{ name: string; position: string; meaning?: string }>;
  moonPhase: string;
  moonSign: string;
  referenceDate?: Date;
  schedule: RitualSchedule;
}): string {
  const config = RITUAL_TYPES[params.ritualType];
  const today = params.referenceDate ?? new Date();
  const todayLabel = formatRitualCalendarDate(today);
  const { schedule } = params;

  const masterStyle = isRitualMaster(params.characterKey)
    ? RITUAL_MASTER_PROMPT_STYLE[params.characterKey]
    : RITUAL_MASTER_PROMPT_STYLE.agafya;

  const healthGuardrail =
    params.ritualType === "health"
      ? `\n— «вылечит», «гарантированное исцеление», любые обещания
       медицинского результата — обряд поддерживает, не заменяет лечение`
      : "";

  return `
${masterStyle}

${buildDateAnchorBlock(today)}

Ты только что провёл диагностику и расклад.
Теперь составляешь персональный ритуал.

ДАННЫЕ ПОЛЬЗОВАТЕЛЯ:
— Имя: ${params.userName}
— Знак: ${params.userZodiac}
— Цель: ${config.label} (${config.desc})
— Луна при заказе: ${params.moonPhase}, в ${params.moonSign}
— Сегодня: ${todayLabel}

РИТУАЛЬНОЕ ВРЕМЯ (рассчитано системой по луне и типу обряда — НЕ МЕНЯТЬ):
— ${schedule.label}
— ${schedule.factors.join("; ")}

ОТВЕТЫ НА ВОПРОСЫ:
${params.answers
  .map(
    (a, i) =>
      `${i + 1}. ${config.questions[i] ?? "Вопрос"}\n   → ${a}`
  )
  .join("\n")}

РАСКЛАД (5 карт):
${(() => {
  const system = resolveDeckSystem(undefined, params.characterKey);
  return params.cards
    .map((c) => {
      const resolved = resolveDeckCard(system, { name: c.name, meaning: c.meaning });
      const meaning = c.meaning?.trim() || resolved.shortMeaning || "";
      return meaning
        ? `— ${c.position}: «${resolved.name || c.name}» — ${meaning}`
        : `— ${c.position}: «${c.name}»`;
    })
    .join("\n");
})()}

СОСТАВЬ РИТУАЛ. Отвечай СТРОГО в этом JSON формате:

{
  "ritual_time_reason": "1-2 предложения ПОЧЕМУ именно это время подходит —
                         ссылайся на карты, ответы пользователя и луну.
                         НЕ указывай другую дату, время или день недели.",

  "ritual_place": "строка — где делать и почему",

  "ritual_items": [
    {
      "item": "название предмета",
      "reason": "почему именно он — со ссылкой на карту"
    }
  ],

  "ritual_steps": [
    {
      "step": "Шаг 1",
      "description": "конкретное действие с деталями"
    },
    {
      "step": "Шаг 2",
      "description": "ОБЯЗАТЕЛЬНО включает физическое действие с телом"
    },
    {
      "step": "Шаг 3 — Кульминация",
      "description": "Момент точки невозврата"
    }
  ],

  "ritual_words": "Персональная фраза с именем ${params.userName}",

  "ritual_word_of_power": "одно слово — руническое или старославянское",

  "ritual_word_of_power_transcription": "как произносить это слово по-русски — кириллицей, без скобок (например: SKJÖLDR → Скьёльдр)",

  "ritual_forbids": [
    "конкретный запрет после ритуала",
    "второй запрет — один обязательно про молчание"
  ],

  "ritual_signs": [
    "конкретный знак 1",
    "конкретный знак 2",
    "конкретный знак 3"
  ]
}

ЗАПРЕЩЕНО:
— менять дату или время ритуала
— называть текущим или предстоящим годом любой год, отличный от указанного в блоке ТЕКУЩАЯ ДАТА выше
— «результат гарантирован»
— «он/она вернётся»
— «деньги придут»
— общие фразы без привязки к картам и ответам
— атрибуты которых нет дома
— более 4 атрибутов
— более 3 шагов${healthGuardrail}

Отвечай ТОЛЬКО валидным JSON. Без текста до и после.
`;
}

export interface RitualGeneratedContent {
  ritual_time: string;
  ritual_place: string;
  ritual_items: Array<{ item: string; reason: string }>;
  ritual_steps: Array<{ step: string; description: string }>;
  ritual_words: string;
  ritual_word_of_power: string;
  ritual_word_of_power_transcription: string;
  ritual_forbids: string[];
  ritual_signs: string[];
}

interface RitualLlmPayload {
  ritual_time_reason?: string;
  ritual_time?: string;
  ritual_place: string;
  ritual_items: Array<{ item: string; reason: string }>;
  ritual_steps: Array<{ step: string; description: string }>;
  ritual_words: string;
  ritual_word_of_power: string;
  ritual_word_of_power_transcription?: string;
  ritual_forbids: string[];
  ritual_signs: string[];
}

function stripMarkdownFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Pull the outermost `{...}` object from model output. */
function extractJsonObject(raw: string): string | null {
  const cleaned = stripMarkdownFence(raw);
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    /* fall through */
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  const slice = cleaned.slice(start, end + 1);
  try {
    JSON.parse(slice);
    return slice;
  } catch {
    return null;
  }
}

function normalizeRitualPayload(parsed: RitualLlmPayload): RitualLlmPayload | null {
  const steps = Array.isArray(parsed.ritual_steps)
    ? parsed.ritual_steps.filter(
        (s) => s && typeof s.step === "string" && typeof s.description === "string"
      )
    : [];
  const place =
    typeof parsed.ritual_place === "string" ? parsed.ritual_place.trim() : "";
  if (!steps.length || !place) return null;

  return {
    ...parsed,
    ritual_place: place,
    ritual_steps: steps,
    ritual_items: Array.isArray(parsed.ritual_items) ? parsed.ritual_items : [],
    ritual_forbids: Array.isArray(parsed.ritual_forbids) ? parsed.ritual_forbids : [],
    ritual_signs: Array.isArray(parsed.ritual_signs) ? parsed.ritual_signs : [],
  };
}

export function parseRitualJson(
  raw: string,
  schedule: RitualSchedule
): RitualGeneratedContent | null {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    console.warn("Ritual JSON extract failed:", raw.slice(0, 200));
    return null;
  }

  try {
    const parsed = normalizeRitualPayload(JSON.parse(jsonText) as RitualLlmPayload);
    if (!parsed) return null;

    const reason = parsed.ritual_time_reason?.trim() || null;
    const ritual_time = buildRitualTimeString(schedule, reason);

    return {
      ritual_time,
      ritual_place: parsed.ritual_place,
      ritual_items: parsed.ritual_items ?? [],
      ritual_steps: parsed.ritual_steps,
      ritual_words: parsed.ritual_words ?? "",
      ritual_word_of_power: parsed.ritual_word_of_power ?? "",
      ritual_word_of_power_transcription:
        parsed.ritual_word_of_power_transcription?.trim() ?? "",
      ritual_forbids: parsed.ritual_forbids ?? [],
      ritual_signs: parsed.ritual_signs ?? [],
    };
  } catch (error) {
    console.warn("Ritual JSON parse failed:", error, jsonText.slice(0, 200));
    return null;
  }
}
