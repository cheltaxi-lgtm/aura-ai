import { getAppUrl } from "@/lib/brand";

const BLOCKED_PREFIXES = [
  "/api/",
  "/admin",
  "/expert",
  "/auth/expert",
  "/_next/",
];

function allowedHosts(): Set<string> {
  const hosts = new Set<string>(["zovus.ru", "www.zovus.ru"]);
  try {
    hosts.add(new URL(getAppUrl()).hostname);
  } catch {
    /* ignore */
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (site) {
    try {
      hosts.add(new URL(site).hostname);
    } catch {
      /* ignore */
    }
  }
  return hosts;
}

/** Normalize bot/site deep links into a same-origin path (+ query/hash). */
export function sanitizeMiniAppPath(raw: string | null | undefined): string {
  const fallback = "/cabinet";
  if (!raw?.trim()) return fallback;
  let path = raw.trim();

  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      if (!allowedHosts().has(u.hostname)) return fallback;
      path = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    return fallback;
  }

  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return fallback;

  const pathOnly = path.split(/[?#]/)[0] || "/";
  for (const blocked of BLOCKED_PREFIXES) {
    if (pathOnly === blocked || pathOnly.startsWith(blocked.endsWith("/") ? blocked : `${blocked}/`)) {
      if (blocked === "/admin" || blocked === "/expert" || blocked === "/auth/expert") {
        return fallback;
      }
      if (blocked === "/api/" || blocked === "/_next/") return fallback;
    }
  }

  return path;
}

export function buildMiniAppEntryUrl(pathOrUrl: string, baseUrl?: string): string {
  const base = (baseUrl || getAppUrl()).replace(/\/$/, "");
  const to = sanitizeMiniAppPath(pathOrUrl);
  return `${base}/tg?to=${encodeURIComponent(to)}`;
}
