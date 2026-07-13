/** Persist share-landing attribution through registration funnel. */

export const SHARE_REGISTRATION_ATTRIBUTION_KEY = "zovus_share_reg_attribution";

export type ShareRegistrationAttribution = {
  token: string;
  kind: string;
};

export function storeShareRegistrationAttribution(token: string, kind: string): void {
  if (typeof window === "undefined" || !token.trim()) return;
  try {
    sessionStorage.setItem(
      SHARE_REGISTRATION_ATTRIBUTION_KEY,
      JSON.stringify({ token: token.trim(), kind: kind.trim() || "spread" })
    );
  } catch {
    /* private mode */
  }
}

export function readShareRegistrationAttribution(): ShareRegistrationAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SHARE_REGISTRATION_ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShareRegistrationAttribution;
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearShareRegistrationAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SHARE_REGISTRATION_ATTRIBUTION_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveRegistrationSource(defaultSource: string): string {
  return readShareRegistrationAttribution() ? "share_landing" : defaultSource;
}
