import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getSpreadCostMultiplier } from "@/lib/spreads/registry";
import type { SpreadId } from "@/lib/spreads";
import type { SpreadIntentDefinition } from "./types";

/** Estimated rune cost for an intent spread (display only; billing stays in existing flows). */
export function estimateIntentRuneCost(spreadId: SpreadId): number {
  const base = DEFAULT_RUNE_COSTS.INTENTION_SPREAD;
  const multiplier = getSpreadCostMultiplier(spreadId);
  return Math.max(1, Math.round(base * multiplier));
}

export function buildSpreadStartUrl(intent: SpreadIntentDefinition): string {
  const params = new URLSearchParams();
  params.set("intent", intent.slug);
  return `/?${params.toString()}`;
}

export function buildMasterAskUrl(intent: SpreadIntentDefinition): string {
  const params = new URLSearchParams();
  params.set("master", intent.recommendedMasterId);
  params.set("ask", intent.questionTemplate);
  return `/?${params.toString()}`;
}

export function buildPhotoReadingUrl(): string {
  return "/?photo=1";
}
