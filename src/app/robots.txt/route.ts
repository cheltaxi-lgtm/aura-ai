import { getAppUrl } from "@/lib/brand";
import {
  ROBOTS_ALLOW,
  ROBOTS_CLEAN_PARAMS,
  ROBOTS_DISALLOW,
} from "@/lib/seo/robots-policy";

/**
 * Custom robots.txt — Next MetadataRoute.Robots cannot emit Yandex Clean-param.
 * Path rules live in robots-policy.ts so prefix matching can be unit-tested.
 */
export function GET() {
  const base = getAppUrl().replace(/\/$/, "");
  const lines = [
    "User-agent: *",
    ...ROBOTS_ALLOW.map((path) => `Allow: ${path}`),
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Clean-param: ${ROBOTS_CLEAN_PARAMS.join("&")} /`,
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
