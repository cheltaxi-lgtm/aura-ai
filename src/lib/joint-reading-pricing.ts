import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getSpread, normalizeSpreadId } from "@/lib/spreads";
import { MAX_INTENTION_SPREAD_RUNES } from "@/lib/spreads/price-limits";

export function estimateJointSpreadCostPerPerson(
  baseIntentionCost: number = DEFAULT_RUNE_COSTS.INTENTION_SPREAD,
  spreadId: string = "love-7"
): number {
  const multiplier = getSpread(normalizeSpreadId(spreadId)).costMultiplier;
  return Math.min(MAX_INTENTION_SPREAD_RUNES, Math.max(1, Math.round(baseIntentionCost * multiplier)));
}

export const JOINT_INVITE_RUNE_COST = DEFAULT_RUNE_COSTS.JOINT_READING;
