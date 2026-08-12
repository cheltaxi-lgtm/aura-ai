import type { CurrentDailyCardsResult } from "@/lib/current-daily-cards";

/**
 * Authenticated daily triplet UI.
 * cooldown denied alone is NOT "opened" — need a server daily artifact.
 */
export type DailyCardsUiState = "loading" | "available" | "opened" | "cooldown";

export function resolveDailyCardsUiState(input: {
  cooldownReady: boolean;
  allowed: boolean | null | undefined;
  currentDaily?: CurrentDailyCardsResult | null;
}): DailyCardsUiState {
  if (!input.cooldownReady) return "loading";
  if (input.allowed === true) return "available";
  if (input.currentDaily?.exists) return "opened";
  return "cooldown";
}

/** True only when a new daily triplet is about to open after entitlement checks. */
export function shouldEmitDailyCardsStarted(input: {
  cooldownReady: boolean;
  localAllowed: boolean;
  syncedAllowed: boolean;
}): boolean {
  return input.cooldownReady && input.localAllowed && input.syncedAllowed;
}
