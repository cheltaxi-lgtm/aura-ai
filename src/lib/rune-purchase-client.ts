/** Client-side helpers for YooKassa rune purchase redirect + success-page confirm. */

export const RUNE_BALANCE_BEFORE_KEY = "aura_runes_before_purchase";
export const RUNE_PENDING_PAYMENT_KEY = "aura_pending_rune_payment_id";
const RUNE_GOAL_FIRED_PREFIX = "aura_rune_goal_fired_";

export function storePendingRunePurchase(paymentId: string, balanceBefore: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RUNE_BALANCE_BEFORE_KEY, String(balanceBefore));
    if (paymentId) {
      localStorage.setItem(RUNE_PENDING_PAYMENT_KEY, paymentId);
    }
  } catch {
    /* private mode / quota */
  }
}

export function readPendingRunePaymentId(searchParams?: URLSearchParams): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = searchParams?.get("paymentId")?.trim();
  if (fromUrl) {
    try {
      localStorage.setItem(RUNE_PENDING_PAYMENT_KEY, fromUrl);
    } catch {
      /* ignore */
    }
    return fromUrl;
  }
  try {
    return localStorage.getItem(RUNE_PENDING_PAYMENT_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRunePurchase(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(RUNE_BALANCE_BEFORE_KEY);
    localStorage.removeItem(RUNE_PENDING_PAYMENT_KEY);
  } catch {
    /* ignore */
  }
}

/** Analytics goals fire once per payment even though the success page polls repeatedly. */
export function markRunePurchaseGoalFired(paymentId: string): void {
  if (typeof window === "undefined" || !paymentId) return;
  try {
    localStorage.setItem(`${RUNE_GOAL_FIRED_PREFIX}${paymentId}`, "1");
  } catch {
    /* ignore */
  }
}

export function hasFiredRunePurchaseGoal(paymentId: string): boolean {
  if (typeof window === "undefined" || !paymentId) return false;
  try {
    return localStorage.getItem(`${RUNE_GOAL_FIRED_PREFIX}${paymentId}`) === "1";
  } catch {
    return false;
  }
}

export function buildRunePurchaseReturnUrl(
  appUrl: string,
  paymentId?: string,
  orderId?: string
): string {
  const base = appUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  if (paymentId) params.set("paymentId", paymentId);
  if (orderId) params.set("orderId", orderId);
  const qs = params.toString();
  return qs ? `${base}/runes/success?${qs}` : `${base}/runes/success`;
}

export function readPendingRuneOrderId(searchParams?: URLSearchParams): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = searchParams?.get("orderId")?.trim();
  if (fromUrl) return fromUrl;
  return null;
}
