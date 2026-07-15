export const BRAND_NAME = "Zovus";
/** Wordmark text beside the Z mark (mark already shows “Z”). */
export const BRAND_WORDMARK = "OVUS";
export const BRAND_DOMAIN = "zovus.ru";
export const BRAND_URL = `https://${BRAND_DOMAIN}`;
export const BRAND_TAGLINE = "эзотерический оракул";
export const BRAND_PLUS = "Zovus+";

/** Shared header lockup — mark + OVUS + beta. */
export const BRAND_LOGO_HEADER = {
  linkToHome: true,
  showTagline: false,
  showBeta: true,
  markSize: 32,
  titleClassName:
    "font-display text-lg font-bold tracking-wider text-white neon-text sm:text-2xl",
} as const;

/** Inline breadcrumb / sub-nav — same lockup, smaller scale. */
export const BRAND_LOGO_BREADCRUMB = {
  linkToHome: true,
  showTagline: false,
  showBeta: true,
  markSize: 24,
  titleClassName:
    "font-display text-sm font-bold tracking-wider text-white neon-text sm:text-base",
} as const;

/** Footer lockup — same identity, no home link. */
export const BRAND_LOGO_FOOTER = {
  showTagline: false,
  showBeta: true,
  markSize: 32,
  titleClassName:
    "font-display text-lg font-bold tracking-wider text-white neon-text sm:text-xl",
} as const;

/** Canonical public site URL (payments, sitemap, OpenRouter referer). */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  return BRAND_URL;
}

export function openRouterAppHeaders(): Record<string, string> {
  const appUrl = getAppUrl();
  const headers: Record<string, string> = { "X-Title": BRAND_NAME };
  if (appUrl) headers["HTTP-Referer"] = appUrl;
  return headers;
}
