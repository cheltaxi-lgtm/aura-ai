import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import {
  buildRitualTimeString,
  computeRitualSchedule,
  formatRitualCalendarDate,
  type RitualSchedule,
} from "@/lib/ritual-timing";

export { formatRitualCalendarDate } from "@/lib/ritual-timing";

export function buildRitualPrompt(params: {
  characterKey: string;
  ritualType: RitualType;
  userName: string;
  userZodiac: string;
  answers: string[];
  cards: Array<{ name: string; position: string }>;
  moonPhase: string;
  moonSign: string;
  referenceDate?: Date;
  schedule: RitualSchedule;
}): string {
  const config = RITUAL_TYPES[params.ritualType];
  const today = params.referenceDate ?? new Date();
  const todayLabel = formatRitualCalendarDate(today);
  const { schedule } = params;

  const masterStyle =
    params.characterKey === "ragnar"
      ? `Ты Рагнар — скандинавский воин-мистик. Стиль: огонь,
       руны, сталь. Атрибуты из твоей системы: свечи (красная,
       чёрная), руническое слово силы, монеты, металл, пепел.
       Тон: жёсткий, конкретный, без лирики.`
      : `Ты Агафья — славянская ведунья. Стиль: вода, травы,
       земля, нить. Атрибуты: травы (полынь, мята, ромашка),
       вода (ключевая, дождевая), нить (красная, белая), соль,
       земля. Тон: мягкий, древний, образный.`;

  return `
${masterStyle}

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
${params.cards.map((c) => `— ${c.position}: ${c.name}`).join("\n")}

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
— «результат гарантирован»
— «он/она вернётся»
— «деньги придут»
— общие фразы без привязки к картам и ответам
— атрибуты которых нет дома
— более 4 атрибутов
— более 3 шагов

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

export function parseRitualJson(
  raw: string,
  schedule: RitualSchedule
): RitualGeneratedContent | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    const parsed = JSON.parse(cleaned) as RitualLlmPayload;
    if (!parsed.ritual_steps?.length || !parsed.ritual_place) return null;

    const reason = parsed.ritual_time_reason?.trim() || null;
    const ritual_time = buildRitualTimeString(schedule, reason);

    return {
      ritual_time,
      ritual_place: parsed.ritual_place,
      ritual_items: parsed.ritual_items ?? [],
      ritual_steps: parsed.ritual_steps,
      ritual_words: parsed.ritual_words,
      ritual_word_of_power: parsed.ritual_word_of_power,
      ritual_word_of_power_transcription:
        parsed.ritual_word_of_power_transcription?.trim() ?? "",
      ritual_forbids: parsed.ritual_forbids ?? [],
      ritual_signs: parsed.ritual_signs ?? [],
    };
  } catch {
    return null;
  }
}
