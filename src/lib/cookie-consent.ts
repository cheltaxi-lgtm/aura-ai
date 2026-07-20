export const COOKIE_CONSENT_KEY = "aura_cookie_consent";

/** "1" = analytics accepted; "0" = necessary only */
export type CookieConsentValue = "1" | "0";

export const COOKIE_CONSENT_EVENT = "aura:cookie-consent";

export function getCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (raw === "1" || raw === "0") return raw;
    return null;
  } catch {
    return null;
  }
}

export function hasCookieConsent(): boolean {
  return getCookieConsent() === "1";
}

/** True once the user made any choice (accept or necessary-only). */
export function hasCookieConsentChoice(): boolean {
  return getCookieConsent() !== null;
}

function persistConsent(value: CookieConsentValue): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(COOKIE_CONSENT_EVENT, { detail: { value } })
    );
  }
}

export function acceptCookieConsent(): void {
  persistConsent("1");
}

/** Necessary cookies only — Metrika tag is not loaded. */
export function declineAnalyticsConsent(): void {
  persistConsent("0");
}
