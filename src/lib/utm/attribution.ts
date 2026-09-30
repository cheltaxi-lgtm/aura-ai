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

// Store only known public entry sections. Dynamic/share URLs may contain bearer tokens.
const PUBLIC_LANDING_SECTIONS = new Set([
  "about", "astrology", "aura", "cards", "dizayn-cheloveka", "faq", "gadanie",
  "gadanie-po-ladoni", "goroskop-na-segodnya", "lenormand", "matrix-destiny",
  "master", "natal-ili-matrica", "natalnaya-karta", "numerology", "obryady",
  "partners", "photo-rasklad", "prognoz", "rasklad", "rasklady", "runes", "runy", "sovmestimost-znakov-zodiaka",
  "statyi", "tariffs", "taro", "voskhodyashchiy-znak", "zovus-pro",
]);

export function safeLandingPath(path: string | null | undefined): string | null {
  if (path === "/") return "/";
  if (!path) return null;
  const match = /^\/([a-z0-9-]+)(?:\/|$)/i.exec(path);
  const section = match?.[1]?.toLowerCase();
  return section && PUBLIC_LANDING_SECTIONS.has(section) ? `/${section}` : null;
}

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
    const landingPath = safeLandingPath(parsed.landingPath);
    if (landingPath) parsed.landingPath = landingPath;
    else delete parsed.landingPath;
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

/** Capture the first landing path and any campaign tags without overwriting first touch. */
export function captureUtmFromLocation(search?: string, pathname?: string): UtmAttribution | null {
  if (!isBrowser()) return null;

  const existing = readUtmAttribution();
  const hasCampaign = (value: UtmAttribution | null) =>
    Boolean(value && Object.keys(value).some((key) => key.startsWith("utm_") || key.endsWith("clid")));
  if (hasCampaign(existing) && existing?.landingPath) return existing;

  const params = new URLSearchParams(search ?? window.location.search);
  const next: UtmAttribution = { ...(existing ?? {}) };
  for (const key of UTM_KEYS) {
    const value = params.get(key)?.trim();
    if (value && !hasCampaign(existing)) next[key] = value.slice(0, 200);
  }

  if (existing?.landingPath && !hasCampaign(next)) return existing;
  const landingPath = existing?.landingPath ?? safeLandingPath(pathname ?? window.location.pathname);
  if (landingPath) next.landingPath = landingPath;
  if (!hasCampaign(next) && !next.landingPath) return null;
  next.capturedAt = existing?.capturedAt ?? new Date().toISOString();

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
