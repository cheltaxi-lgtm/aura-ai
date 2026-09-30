import { SPREAD_REGISTRY } from "@/lib/spreads/registry";
import type { SpreadId, SpreadCatalogSettings } from "@/lib/spreads/types";

/** Actual price including bonus runes, compared with the live custom top-up rate. */
export function runePackageValue(pkg: {runes:number;bonus_runes:number;price_rub:number},rubPerRune:number) {
  const total=Number(pkg.runes)+Number(pkg.bonus_runes);
  const price=Number(pkg.price_rub);
  if(![total,price,rubPerRune].every(Number.isFinite)||total<=0||price<=0||rubPerRune<=0)return null;
  const perRune=price/total;
  return {perRune,savingPercent:Math.max(0,Math.floor((1-perRune/rubPerRune)*100))};
}

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
