import { runeCostFromSettings, type RuneSettings } from "@/lib/rune-settings";
import type { RuneActionType } from "@/lib/rune-costs";
import { getSpreadCostMultiplier } from "./registry";
import type { SpreadId } from "./types";
import { MAX_INTENTION_SPREAD_RUNES } from "./price-limits";

export function resolveSpreadCost(
  spreadId: SpreadId | string | null | undefined,
  settings: RuneSettings,
  action: RuneActionType = "INTENTION_SPREAD"
): number {
  const base = runeCostFromSettings(settings, action);
  const multiplier = getSpreadCostMultiplier(spreadId);
  const cost = Math.max(1, Math.round(base * multiplier));
  return action === "INTENTION_SPREAD" ? Math.min(MAX_INTENTION_SPREAD_RUNES, cost) : cost;
}
