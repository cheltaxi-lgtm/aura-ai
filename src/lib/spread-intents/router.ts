import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getSpreadCostMultiplier, isDailyOnlySpread } from "@/lib/spreads/registry";
import type { SessionTopicId } from "@/lib/session-topics";
import type { SpreadId } from "@/lib/spreads";
import type { SpreadIntentDefinition } from "./types";
import { resolveIntentMasterId } from "./resolve-master";
/** Estimated rune cost for an intent spread (display only; billing stays in existing flows). */
export function estimateIntentRuneCost(spreadId: SpreadId): number {
  const base = DEFAULT_RUNE_COSTS.INTENTION_SPREAD;
  const multiplier = getSpreadCostMultiplier(spreadId);
  return Math.max(1, Math.round(base * multiplier));
}

export function buildSpreadStartUrl(
  intent: SpreadIntentDefinition,
  customQuestion?: string | null
): string {
  if (isDailyOnlySpread(intent.spreadId)) {
    return "/?daily=extended";
  }
  const params = new URLSearchParams();
  params.set("intent", intent.slug);
  const q = customQuestion?.trim();
  if (q) params.set("ask", q);
  return `/?${params.toString()}`;
}

/** Indexable landing for an intent (crawlable; not the in-app deep link). */
export function buildIntentSeoUrl(intent: SpreadIntentDefinition | string): string {
  const slug = typeof intent === "string" ? intent : intent.slug;
  return `/rasklady/${slug}`;
}

export function buildMasterAskUrl(intent: SpreadIntentDefinition): string {
  return buildAskUrl(intent.questionTemplate, resolveIntentMasterId(intent));
}

/** Free-form question from hero / notifications → home deep link. */
export function buildAskUrl(
  question: string,
  master = "veronika",
  options?: { spread?: boolean }
): string {
  const params = new URLSearchParams();
  params.set("ask", question.trim());
  if (master) params.set("master", master);
  if (options?.spread) params.set("spread", "1");
  return `/?${params.toString()}`;
}

/** Reliable in-app navigation (avoids Next.js Link issues on /#hash). */
export function navigateToUrl(href: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(href);
}

export function navigateToIntent(intent: SpreadIntentDefinition): void {
  navigateToUrl(buildSpreadStartUrl(intent));
}

export function buildPhotoReadingUrl(mode?: "mark" | "upload"): string {
  if (mode === "mark") return "/?photo=1&mode=mark";
  return "/?photo=1";
}

export function buildPhotoMarkUrl(): string {
  return buildPhotoReadingUrl("mark");
}

export function resolveIntentSessionTopic(intent: SpreadIntentDefinition): SessionTopicId {
  switch (intent.category) {
    case "love":
      return "love";
    case "career":
    case "money":
      return "money";
    case "ritual":
      return "enemies";
    case "future":
      return "sign";
    case "self":
    case "choice":
    case "family":
    default:
      return "path";
  }
}
