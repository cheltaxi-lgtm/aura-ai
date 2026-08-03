import { isSearchIndexableIntentSlug } from "./indexability";

/** App deep-link params that should not be indexed as separate URLs. */
const HOME_JUNK_PARAMS = [
  "app",
  "step",
  "ask",
  "master",
  "daily",
  "spread",
  "mode",
  "intent",
  "photo",
  "tool",
  "numerolog",
  "joint",
  "jointRole",
  "jointPartnerName",
  "jointInvite",
  "runeShop",
  "tab",
  "invite",
  "to",
  "_bridged",
  "oauthError",
  "_restart",
  "_auth",
  "welcome",
  "returnTo",
] as const;

/**
 * For search bots on `/` with app deep-link query params, return a clean
 * canonical path to 301 to. Humans keep query-driven SPA entry.
 */
export function resolveBotHomeQueryRedirect(
  searchParams: URLSearchParams
): string | null {
  if (searchParams.has("photo")) {
    return "/photo-rasklad";
  }

  const intent = searchParams.get("intent")?.trim() ?? "";
  if (intent && /^[a-z0-9-]+$/i.test(intent) && isSearchIndexableIntentSlug(intent)) {
    return `/rasklady/${intent}`;
  }

  const hasJunk = HOME_JUNK_PARAMS.some((key) => searchParams.has(key));
  if (hasJunk) {
    return "/";
  }

  return null;
}
