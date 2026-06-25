export const BRAND_NAME = "Zovus";
export const BRAND_DOMAIN = "zovus.ru";
export const BRAND_URL = `https://${BRAND_DOMAIN}`;
export const BRAND_TAGLINE = "эзотерический оракул";
export const BRAND_PLUS = "Zovus+";

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
