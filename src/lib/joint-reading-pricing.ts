import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getSpread, normalizeSpreadId } from "@/lib/spreads";

export function estimateJointSpreadCostPerPerson(
  baseIntentionCost: number = DEFAULT_RUNE_COSTS.INTENTION_SPREAD,
  spreadId: string = "love-7"
): number {
  const multiplier = getSpread(normalizeSpreadId(spreadId)).costMultiplier;
  return Math.max(1, Math.round(baseIntentionCost * multiplier));
}

export const JOINT_INVITE_RUNE_COST = DEFAULT_RUNE_COSTS.JOINT_READING;
