/**
 * Match a search query to an existing whitelist landing. Never invents new URLs.
 */
import { getWhitelistPaths, isLandingWhitelisted, normalizeForMatch } from "../validator";

const CLUSTER_LANDING: { re: RegExp; path: string; cluster: string }[] = [
  { re: /матриц|судьб.*цифр|цифров.*матриц/i, path: "/numerology/destiny-matrix", cluster: "matrix" },
  { re: /рун/i, path: "/runy", cluster: "runes" },
  { re: /нумеролог|пифагор/i, path: "/numerology", cluster: "numerology" },
  { re: /таро|аркан|гадан/i, path: "/taro", cluster: "taro" },
  { re: /прогноз|гороскоп/i, path: "/prognoz", cluster: "prognoz" },
  { re: /фото.*расклад|расклад.*фото/i, path: "/statyi/rasshifrovka-taro-po-foto", cluster: "photo" },
  { re: /стать/i, path: "/statyi", cluster: "articles" },
];

export function matchExistingLanding(query: string): {
  cluster: string | null;
  targetUrl: string | null;
  landingMatch: boolean;
} {
  const n = normalizeForMatch(query);
  for (const row of CLUSTER_LANDING) {
    if (row.re.test(n) && isLandingWhitelisted(row.path)) {
      return { cluster: row.cluster, targetUrl: row.path, landingMatch: true };
    }
  }
  for (const p of getWhitelistPaths()) {
    const slug = p.replace(/^\//, "").replace(/\//g, " ").replace(/-/g, " ");
    if (slug && n.includes(normalizeForMatch(slug))) {
      return {
        cluster: p.replace(/^\//, "").split("/")[0] || "misc",
        targetUrl: p,
        landingMatch: true,
      };
    }
  }
  return { cluster: null, targetUrl: null, landingMatch: false };
}
