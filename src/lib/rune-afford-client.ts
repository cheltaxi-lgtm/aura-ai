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
