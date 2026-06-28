export const COOKIE_CONSENT_KEY = "aura_cookie_consent";

export const COOKIE_CONSENT_EVENT = "aura:cookie-consent";

export function hasCookieConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptCookieConsent(): void {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, "1");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  }
}
