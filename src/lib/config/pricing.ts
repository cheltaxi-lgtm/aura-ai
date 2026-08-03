import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";

/** Single source of truth for fixed session prices (runes). */
export const PRICING = {
  /** Полная расшифровка «Три числа» у Эвелины. */
  NUMEROLOGY_SESSION: 20,
  MATRIX_SUBJECT_REPORT: 20,
  CHILD_MATRIX_REPORT: 25,
  MATRIX_PAIR_REPORT: 30,
  MATRIX_YEAR_FORECAST: 20,
  MATRIX_SUBJECT_LIMIT: 10,
  /**
   * Вопросы в чате, включённые в разовую покупку Full Matrix.
   * После лимита — обычный тариф QUESTION.
   */
  MATRIX_INCLUDED_QUESTIONS: 3,
  READING: DEFAULT_RUNE_COSTS.READING,
  INTENTION_SPREAD: DEFAULT_RUNE_COSTS.INTENTION_SPREAD,
  QUESTION: DEFAULT_RUNE_COSTS.QUESTION,
  VISION_ANALYSIS: DEFAULT_RUNE_COSTS.VISION_ANALYSIS,
  DAILY_EXTENDED: DEFAULT_RUNE_COSTS.DAILY_EXTENDED,
} as const;

export function numerologySessionCost(): number {
  return PRICING.NUMEROLOGY_SESSION;
}

export function matrixIncludedQuestions(): number {
  return PRICING.MATRIX_INCLUDED_QUESTIONS;
}
