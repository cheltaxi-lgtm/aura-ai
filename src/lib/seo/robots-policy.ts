/**
 * Crawl policy for /robots.txt.
 *
 * Yandex and Google treat Disallow as a prefix. A bare `/pro` therefore
 * also blocks `/prognoz…`, and `/tg` also blocks `/telegram`.
 * Use `$` (end of path) plus a trailing-slash prefix for private trees.
 */

export const ROBOTS_ALLOW = [
  "/",
  "/prognoz",
  "/telegram",
] as const;

export const ROBOTS_DISALLOW = [
  "/api/",
  "/admin/",
  "/auth/",
  "/login",
  "/register",
  "/cabinet",
  "/account",
  "/dashboard",
  "/checkout",
  "/payment",
  "/webhook",
  "/diary",
  "/expert",
  "/expert/",
  "/pro$",
  "/pro/",
  "/r/",
  "/p/",
  "/runes/success",
  "/share/",
  "/master/",
  "/_next/",
  "/app$",
  "/app/",
  "/session/",
  "/joint-reading/",
  "/tg$",
  "/tg/",
  "/diary/",
  "/maintenance",
  "/dev/",
  "/reports/",
  "/photo-rasklad/result",
  "/dizayn-cheloveka/karta/",
] as const;

/** Query keys that do not change page meaning for crawlers (Yandex Clean-param). */
export const ROBOTS_CLEAN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "yclid",
  "gclid",
  "fbclid",
  "ysclid",
  "from",
  "ref",
  "v",
  "app",
  "intent",
  "numerolog",
  "photo",
  "tool",
  "mode",
  "returnTo",
  "step",
  "spread",
  "page",
  "ask",
  "master",
  "daily",
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
] as const;

export function robotsRuleMatches(pathname: string, rule: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (rule.endsWith("$")) {
    return path === rule.slice(0, -1);
  }
  return path.startsWith(rule);
}

/**
 * Longest matching prefix wins (Yandex / Google).
 * Equal length: Allow wins so public exceptions stay crawlable.
 */
export function isRobotsPathAllowed(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  let bestLen = 0;
  let allowed = true;

  for (const rule of ROBOTS_ALLOW) {
    if (robotsRuleMatches(path, rule) && rule.length >= bestLen) {
      bestLen = rule.length;
      allowed = true;
    }
  }
  for (const rule of ROBOTS_DISALLOW) {
    if (robotsRuleMatches(path, rule) && rule.length > bestLen) {
      bestLen = rule.length;
      allowed = false;
    }
  }
  return allowed;
}
