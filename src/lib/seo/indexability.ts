/**
 * Search-index policy for SEO surfaces.
 * Thin template intents (esp. mass da-net-*) get crawled as low-value by Yandex —
 * keep them on-site for UX, but out of sitemap / with noindex.
 */

/** Mass “да/нет” intents: near-duplicate templates, low demand in Yandex. */
export function isThinDaNetIntentSlug(slug: string): boolean {
  return slug.startsWith("da-net-");
}

/** Whether `/rasklady/{slug}` should be offered to search engines. */
export function isSearchIndexableIntentSlug(slug: string): boolean {
  if (isThinDaNetIntentSlug(slug)) return false;
  return true;
}

const SEARCH_BOT_UA =
  /(?:googlebot|yandex(?:bot|images|mobile|accessibility|blogs|favicons|media|metrika|news|video)?|bingbot|duckduckbot|slurp|baiduspider|applebot|semrushbot|ahrefsbot|dotbot|petalbot|facebookexternalhit|twitterbot)/i;

export function isSearchEngineBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return SEARCH_BOT_UA.test(userAgent);
}
