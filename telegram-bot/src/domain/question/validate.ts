import { normalizeSafetyText } from "../../safety/normalize.js";

const MAX_LEN = 500;
const MIN_LEN = 8;

export type QuestionValidation =
  | { ok: true; question: string }
  | { ok: false; reason: string; code?: "crisis" | "medical" | "minor" | "third_party" | "weak" };

/**
 * Patterns against normalizeSafetyText (no spaces; letter repeats collapsed to 1).
 * Note: "хочу"+"умереть" → хочумереть; "покончить с собой" → покончитьсобой.
 */
const CRISIS_NORM =
  /суицид|убитьсебя|покончитьсобой|нехочужит|хочумерет|умертвитьсебя|самоубий|порезатьсебя|самоповрежд|убить(его|ее|их|кого)|расчлен|застрел/;

const MEDICAL_NORM =
  /диагноз|лечить|лекарств|онкологи|аборт|психиатр|адвокат|приговор|юрист|беременнтест|беременнсрок/;

/** Minors: require ownership / legal-age markers — avoid “чувствую себя как ребёнок”. */
const MINOR_RAW =
  /несовершеннолет|(мой|моего|мою|моя|моему|моей)\s+(ребён|ребенок|девочк|мальчик|сын|дочь)|подростк[а-яё]*\s+сын|(ребён|ребенок|девочк|мальчик).{0,12}школ|гада[а-яё]*.{0,24}(ребён|ребенок|девочк|мальчик|дочь|сын)/i;

const THIRD_RAW =
  /\b(моя жена|мой муж|моя дочь|мой сын|его жена|её муж)\b.*\b(изменит|изменил|умрёт|умрет)\b/i;

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

  const norm = normalizeSafetyText(question);
  if (CRISIS_NORM.test(norm)) {
    return { ok: false, reason: "crisis", code: "crisis" };
  }
  if (MEDICAL_NORM.test(norm) || MEDICAL_NORM.test(normalizeSafetyText(question.replace(/ё/g, "е")))) {
    return { ok: false, reason: "medical", code: "medical" };
  }
  if (MINOR_RAW.test(question)) {
    return { ok: false, reason: "minor", code: "minor" };
  }
  if (THIRD_RAW.test(question)) {
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
