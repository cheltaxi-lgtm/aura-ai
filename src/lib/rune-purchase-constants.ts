/** Minimum rub amount for custom rune top-up (client + server). */
export const MIN_CUSTOM_RUNE_PURCHASE_RUB = 100;

/** Maximum rub amount for custom rune top-up (client + server). */
export const MAX_CUSTOM_RUNE_PURCHASE_RUB = 50000;

export function runesFromRubAmount(amountRub: number, rubPerRune: number): number {
  if (!Number.isFinite(amountRub) || amountRub <= 0 || rubPerRune <= 0) return 0;
  return Math.floor(amountRub / rubPerRune);
}

export function parseCustomRubAmount(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}
