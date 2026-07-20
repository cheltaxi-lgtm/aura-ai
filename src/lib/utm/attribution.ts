/** First-touch UTM / click-id attribution for ad ROI (persists through registration). */

export const UTM_ATTRIBUTION_KEY = "zovus_utm_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "yclid",
  "ysclid",
  "gclid",
  "fbclid",
] as const;

export type UtmAttribution = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  landingPath?: string;
  capturedAt?: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function readUtmAttribution(): UtmAttribution | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(UTM_ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UtmAttribution;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearUtmAttribution(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(UTM_ATTRIBUTION_KEY);
  } catch {
    /* ignore */
  }
}

/** Capture first-touch UTMs from the current URL. Does not overwrite an existing first touch. */
export function captureUtmFromLocation(search?: string, pathname?: string): UtmAttribution | null {
  if (!isBrowser()) return null;

  const existing = readUtmAttribution();
  if (existing && Object.keys(existing).some((k) => k.startsWith("utm_") || k.endsWith("clid"))) {
    return existing;
  }

  const params = new URLSearchParams(search ?? window.location.search);
  const next: UtmAttribution = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value) next[key] = value.slice(0, 200);
  }

  if (!Object.keys(next).length) return existing;

  next.landingPath = (pathname ?? window.location.pathname).slice(0, 300);
  next.capturedAt = new Date().toISOString();

  try {
    localStorage.setItem(UTM_ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

/** Flat params safe for Metrika reachGoal. */
export function utmParamsForMetrika(): Record<string, string> {
  const utm = readUtmAttribution();
  if (!utm) return {};
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = utm[key];
    if (value) out[key] = value;
  }
  if (utm.landingPath) out.landing_path = utm.landingPath;
  return out;
}

/** Prefer campaign source for registration_source when no share attribution. */
export function resolveUtmRegistrationSource(defaultSource: string): string {
  const utm = readUtmAttribution();
  if (utm?.utm_source) {
    const medium = utm.utm_medium ? `_${utm.utm_medium}` : "";
    return `utm_${utm.utm_source}${medium}`.slice(0, 64);
  }
  if (utm?.yclid || utm?.ysclid) return "yandex_direct";
  if (utm?.gclid) return "google_ads";
  return defaultSource;
}
