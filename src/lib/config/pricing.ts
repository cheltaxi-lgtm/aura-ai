import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";

/** Single source of truth for fixed session prices (runes). */
export const PRICING = {
  /** Полная расшифровка «Три числа» у Эвелины. */
  NUMEROLOGY_SESSION: 20,
  READING: DEFAULT_RUNE_COSTS.READING,
  INTENTION_SPREAD: DEFAULT_RUNE_COSTS.INTENTION_SPREAD,
  QUESTION: DEFAULT_RUNE_COSTS.QUESTION,
  VISION_ANALYSIS: DEFAULT_RUNE_COSTS.VISION_ANALYSIS,
} as const;

export function numerologySessionCost(): number {
  return PRICING.NUMEROLOGY_SESSION;
}
