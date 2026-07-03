/** Client-side helpers for YooKassa rune purchase redirect + success-page confirm. */

export const RUNE_BALANCE_BEFORE_KEY = "aura_runes_before_purchase";
export const RUNE_PENDING_PAYMENT_KEY = "aura_pending_rune_payment_id";

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

export function buildRunePurchaseReturnUrl(appUrl: string, paymentId: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/runes/success?paymentId=${encodeURIComponent(paymentId)}`;
}
