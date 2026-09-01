/**
 * Search-index policy for SEO surfaces.
 * Thin template intents (esp. mass da-net-*) get crawled as low-value by Yandex —
 * keep them on-site for UX, but out of sitemap / with noindex.
 */

/** Mass “да/нет” intents: near-duplicate templates, low demand in Yandex. */
export function isThinDaNetIntentSlug(slug: string): boolean {
  return slug.startsWith("da-net-");
}

/**
 * Thin mass-generated slugs whose intent is fully covered by a stronger
 * hand-curated page. Keeping them indexable splits signals and risks a
 * "thin/duplicate" verdict on the whole family — keep the URLs live for UX,
 * but out of search.
 *
 * lyubov-kak-otpustit-ego/ee — gender-swapped clones ("Путь освобождения.")
 * of /rasklady/kak-otpustit-cheloveka (hand-written override, active in search).
 */
const SEMANTIC_DUPLICATE_INTENT_SLUGS = new Set([
  "lyubov-kak-otpustit-ego",
  "lyubov-kak-otpustit-ee",
  // Word-order clone of /rasklady/chto-ona-chuvstvuet (same title in Webmaster).
  "chto-chuvstvuet-ona",
]);

/** Whether `/rasklady/{slug}` should be offered to search engines. */
export function isSearchIndexableIntentSlug(slug: string): boolean {
  if (isThinDaNetIntentSlug(slug)) return false;
  if (SEMANTIC_DUPLICATE_INTENT_SLUGS.has(slug)) return false;
  return true;
}

const SEARCH_BOT_UA =
  /(?:googlebot|yandex(?:bot|images|mobile|accessibility|blogs|favicons|media|metrika|news|video)?|bingbot|duckduckbot|slurp|baiduspider|applebot|semrushbot|ahrefsbot|dotbot|petalbot|facebookexternalhit|twitterbot)/i;

export function isSearchEngineBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return SEARCH_BOT_UA.test(userAgent);
}
