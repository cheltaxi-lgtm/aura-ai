import { isAiMasterId } from "@/lib/showcase-masters";
import type { SpreadId } from "@/lib/spreads";
import type { SpreadIntentDefinition } from "./types";

/** Lenormand oracle spreads always use a known AI master; deck comes from spreadId. */
export function resolveLenormandSessionMaster(): string {
  return "veronika";
}

export function resolveIntentMasterId(
  intent: Pick<SpreadIntentDefinition, "spreadId" | "recommendedMasterId">
): string {
  if (intent.spreadId === "lenormand-line") {
    return resolveLenormandSessionMaster();
  }
  const id = intent.recommendedMasterId?.trim();
  if (id && isAiMasterId(id)) return id;
  return "veronika";
}

export function isLenormandSpreadId(spreadId: SpreadId | string | null | undefined): boolean {
  return spreadId === "lenormand-line";
}
