/** Pro rune prices — config/ENV only, never hardcoded in handlers. */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export type ProPricedAction =
  | "generate_draft"
  | "refine_block"
  | "client_dialog_draft"
  | "deliver";

const DEFAULTS: Record<ProPricedAction, number> = {
  generate_draft: 15,
  refine_block: 5,
  client_dialog_draft: 3,
  deliver: 0,
};

export function proRuneCost(action: ProPricedAction): number {
  const envKey = `PRO_COST_${action.toUpperCase()}`;
  return intEnv(envKey, DEFAULTS[action]);
}

export function proFreeTrialRunes(): number {
  return intEnv("PRO_FREE_TRIAL_RUNES", 50);
}

export function proFreeTrialDays(): number {
  return intEnv("PRO_FREE_TRIAL_DAYS", 14);
}
