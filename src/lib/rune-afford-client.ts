/** Client-side rune affordability (mirrors server isRuneBillingActive + canAfford). */
export function canAffordRunes(opts: {
  enabled: boolean;
  unlimited?: boolean;
  balance: number;
  cost: number;
}): boolean {
  if (!opts.enabled || opts.unlimited) return true;
  if (opts.cost <= 0) return true;
  return opts.balance >= opts.cost;
}

/** Whether a full spread reading (/api/reading) should charge runes on the client gate. */
export function isSpreadReadingBillingActive(opts: {
  spreadType?: string | null;
  isLoggedIn: boolean;
  runeBillingEnabled: boolean;
  hasFullAccess?: boolean;
  sessionOffline?: boolean;
  isUnlimited?: boolean;
}): boolean {
  // UI preflight only — server decides final billing.
  if (opts.spreadType === "daily" || opts.spreadType === "guest_resume") return false;
  return (
    opts.isLoggedIn &&
    opts.runeBillingEnabled &&
    !opts.hasFullAccess &&
    !opts.sessionOffline &&
    !opts.isUnlimited
  );
}

export function gateSpreadReadingRunes(opts: {
  billingActive: boolean;
  balance: number;
  cost: number;
}): { blocked: false } | { blocked: true; balance: number; required: number } {
  if (!opts.billingActive) return { blocked: false };
  if (canAffordRunes({ enabled: true, balance: opts.balance, cost: opts.cost })) {
    return { blocked: false };
  }
  return { blocked: true, balance: opts.balance, required: opts.cost };
}

export function runeShortfall(opts: {
  enabled: boolean;
  unlimited?: boolean;
  balance: number;
  cost: number;
}): { blocked: boolean; required: number; balance: number } {
  const allowed = canAffordRunes(opts);
  return {
    blocked: !allowed,
    required: opts.cost,
    balance: opts.balance,
  };
}
