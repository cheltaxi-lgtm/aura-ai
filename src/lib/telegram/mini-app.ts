import { getAppUrl } from "@/lib/brand";
import { encodeMiniAppStartParam } from "@/lib/telegram/mini-app-start-param";

export {
  decodeMiniAppStartParam,
  encodeMiniAppStartParam,
} from "@/lib/telegram/mini-app-start-param";

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
  if (path.includes("\\") || /%5c/i.test(path)) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return fallback;

  try {
    const origin = getAppUrl().replace(/\/$/, "");
    const resolved = new URL(path, `${origin}/`);
    if (resolved.origin !== new URL(`${origin}/`).origin) return fallback;
  } catch {
    return fallback;
  }

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

/** HTTPS shell used by the single menu-button web_app launcher. */
export function buildMiniAppShellUrl(baseUrl?: string): string {
  const base = (baseUrl || getAppUrl()).replace(/\/$/, "");
  return `${base}/tg`;
}

/**
 * Deep link into the one Main Mini App (t.me?startapp=).
 * Prefer this over /tg?to= for bot CTAs — avoids stacking WebViews.
 */
export function buildMiniAppEntryUrl(pathOrUrl: string, botUsername?: string): string {
  const username = (
    botUsername ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    process.env.TELEGRAM_BOT_USERNAME ||
    "zovus_card_bot"
  )
    .trim()
    .replace(/^@/, "");
  const startapp = encodeMiniAppStartParam(sanitizeMiniAppPath(pathOrUrl));
  const short = process.env.NEXT_PUBLIC_TELEGRAM_MINI_APP_SHORT_NAME?.trim();
  if (short) {
    return `https://t.me/${username}/${short}?startapp=${encodeURIComponent(startapp)}`;
  }
  return `https://t.me/${username}?startapp=${encodeURIComponent(startapp)}`;
}
