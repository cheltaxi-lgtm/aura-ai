/** Authenticated daily triplet UI — never treat unloaded cooldown as available. */
export type DailyCardsUiState = "loading" | "available" | "used";

export function resolveDailyCardsUiState(input: {
  cooldownReady: boolean;
  allowed: boolean | null | undefined;
}): DailyCardsUiState {
  if (!input.cooldownReady) return "loading";
  if (input.allowed === true) return "available";
  return "used";
}

/** True only when a new daily triplet is about to open after entitlement checks. */
export function shouldEmitDailyCardsStarted(input: {
  cooldownReady: boolean;
  localAllowed: boolean;
  syncedAllowed: boolean;
}): boolean {
  return input.cooldownReady && input.localAllowed && input.syncedAllowed;
}
