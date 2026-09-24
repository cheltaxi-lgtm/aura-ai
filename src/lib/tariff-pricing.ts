import { SPREAD_REGISTRY } from "@/lib/spreads/registry";
import type { SpreadId, SpreadCatalogSettings } from "@/lib/spreads/types";

/** Match the charged INTENTION_SPREAD formula for every currently selectable scheme. */
export function intentionSpreadPriceRange(
  baseCost: number,
  settings: SpreadCatalogSettings
): { min: number; max: number } | null {
  const costs = (Object.keys(SPREAD_REGISTRY) as SpreadId[])
    .filter((id) => id !== "daily-extended")
    .filter((id) => settings.spreadsCatalogEnabled
      ? settings.spreadOverrides[id]?.enabled !== false
      : id === "triplet")
    .map((id) => {
      const multiplier = settings.spreadOverrides[id]?.costMultiplier || SPREAD_REGISTRY[id].costMultiplier;
      return Math.max(1, Math.round(baseCost * multiplier));
    });
  if (costs.length === 0) return null;
  return { min: Math.min(...costs), max: Math.max(...costs) };
}
