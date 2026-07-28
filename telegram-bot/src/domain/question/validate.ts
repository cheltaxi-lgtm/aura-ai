const MAX_LEN = 500;
const MIN_LEN = 8;

export type QuestionValidation =
  | { ok: true; question: string }
  | { ok: false; reason: string; code?: "crisis" | "medical" | "minor" | "third_party" | "weak" };

const CRISIS =
  /суицид|убить себя|покончить с собой|не хочу жить|хочу умереть|умертвить себя|самоубий|порезать себя|самоповрежд|убить (его|её|ее|их|кого)|расчлен|застрел/i;

const MEDICAL =
  /диагноз|лечить|лекарств|онкологи|беременн.*(тест|срок)|аборт|психиатр|суд\b|адвокат|приговор|юрист/i;

const MINOR =
  /\b(ребён|ребенок|девочк|мальчик|школьник|несовершеннолет|подростк)/i;

const THIRD =
  /\b(моя жена|мой муж|моя дочь|мой сын|его жена|её муж)\b.*\b(изменит|изменил|умрёт|умрет|умрёт)\b/i;

export function sanitizeQuestion(raw: string): string {
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LEN);
}

export function validateQuestion(raw: unknown): QuestionValidation {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Напишите вопрос своими словами — коротко и по сути.", code: "weak" };
  }
  const question = sanitizeQuestion(raw);
  if (question.length < MIN_LEN) {
    return {
      ok: false,
      reason: "Слишком коротко. Добавьте чуть больше контекста — что именно тревожит.",
      code: "weak",
    };
  }
  if (/^(.)\1{5,}$/i.test(question) || /^[.?!\s]+$/.test(question)) {
    return { ok: false, reason: "Похоже на случайный набор. Переформулируйте вопрос.", code: "weak" };
  }
  if (CRISIS.test(question)) {
    return { ok: false, reason: "crisis", code: "crisis" };
  }
  if (MEDICAL.test(question)) {
    return { ok: false, reason: "medical", code: "medical" };
  }
  if (MINOR.test(question)) {
    return { ok: false, reason: "minor", code: "minor" };
  }
  if (THIRD.test(question)) {
    return { ok: false, reason: "third_party", code: "third_party" };
  }
  return { ok: true, question };
}

export const PAIN_CHIPS = [
  "Он не пишет третий день",
  "Уволиться или терпеть",
  "Мы вообще вместе?",
  "Куда уходят деньги",
  "Что меня ждёт",
] as const;
