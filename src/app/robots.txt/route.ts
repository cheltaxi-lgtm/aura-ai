import { getAppUrl } from "@/lib/brand";

/**
 * Custom robots.txt — Next MetadataRoute.Robots cannot emit Yandex Clean-param.
 * Keep path rules in sync with the former src/app/robots.ts.
 */
const DISALLOW = [
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
  "/pro",
  "/pro/",
  "/r/",
  "/runes/success",
  "/share/",
  "/master/",
  "/_next/",
  "/app",
  "/session/",
  "/joint-reading/",
  "/tg",
  "/diary/",
  "/maintenance",
  "/reports/",
  "/photo-rasklad/result",
  "/dizayn-cheloveka/karta/",
] as const;

/** Query keys that do not change page meaning for crawlers (Yandex Clean-param). */
const CLEAN_PARAMS = [
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

export function GET() {
  const base = getAppUrl().replace(/\/$/, "");
  const lines = [
    "User-agent: *",
    "Allow: /",
    ...DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Clean-param: ${CLEAN_PARAMS.join("&")} /`,
    "",
    `Host: ${base}`,
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
