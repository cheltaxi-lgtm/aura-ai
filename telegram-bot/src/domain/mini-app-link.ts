import { botConfig } from "../config.js";

/**
 * Single Main Mini App deep links: https://t.me/<bot>?startapp=<payload>
 * Avoids stacking many web_app WebViews with different URLs.
 */

const STARTAPP_RE = /^[A-Za-z0-9_-]{1,64}$/;

function stripTrackingParams(pathWithQuery: string): string {
  try {
    const u = new URL(pathWithQuery, "https://zovus.ru");
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "app") {
        u.searchParams.delete(key);
      }
    }
    const q = u.searchParams.toString();
    return `${u.pathname}${q ? `?${q}` : ""}${u.hash || ""}` || "/cabinet";
  } catch {
    return pathWithQuery;
  }
}

function b64urlEncode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function normalizePath(pathOrUrl: string): string {
  let path = (pathOrUrl || "/cabinet").trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      const siteHost = new URL(botConfig.siteUrl).hostname.replace(/^www\./, "");
      const host = u.hostname.replace(/^www\./, "");
      if (host !== siteHost && !host.endsWith(`.${siteHost}`)) {
        return path; // external absolute — caller should use .url() as-is
      }
      path = `${u.pathname}${u.search}${u.hash}` || "/cabinet";
    }
  } catch {
    path = "/cabinet";
  }
  if (!path.startsWith("/") || path.startsWith("//")) path = "/cabinet";
  return stripTrackingParams(path);
}

export function encodeMiniAppStartParam(pathOrUrl: string): string {
  const path = normalizePath(pathOrUrl);
  if (/^https?:\/\//i.test(path)) return "cabinet";

  try {
    const u = new URL(path, "https://zovus.ru");
    const chat = u.searchParams.get("chat_session");
    if ((u.pathname === "/" || u.pathname === "") && chat) {
      const compact = chat.replace(/-/g, "");
      if (/^[0-9a-f]{32}$/i.test(compact)) {
        const p = `chat_${compact}`;
        if (STARTAPP_RE.test(p)) return p;
      }
    }
    if (u.pathname === "/cabinet") {
      if (u.searchParams.get("shop") === "1" || u.searchParams.get("topup") === "1") {
        return "shop";
      }
      if (![...u.searchParams.keys()].length) return "cabinet";
    }
    if (u.pathname === "/" && ![...u.searchParams.keys()].length) return "home";
    if (u.pathname === "/photo-rasklad") return "photo";
    if (u.pathname === "/gadanie-po-ladoni") return "palm";
  } catch {
    /* fall through */
  }

  const encoded = b64urlEncode(path);
  if (STARTAPP_RE.test(encoded)) return encoded;
  return "cabinet";
}

export function decodeMiniAppStartParam(raw: string | null | undefined): string {
  const param = (raw || "").trim();
  if (!param || !STARTAPP_RE.test(param)) return "/cabinet";
  if (param === "cabinet") return "/cabinet";
  if (param === "shop") return "/cabinet?shop=1";
  if (param === "home") return "/";
  if (param === "photo") return "/photo-rasklad";
  if (param === "palm") return "/gadanie-po-ladoni";
  if (param === "link") return "/cabinet";
  if (param.startsWith("chat_")) {
    const hex = param.slice("chat_".length);
    if (/^[0-9a-f]{32}$/i.test(hex)) {
      const h = hex.toLowerCase();
      const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      return `/?chat_session=${uuid}`;
    }
  }
  try {
    const decoded = Buffer.from(param, "base64url").toString("utf8");
    if (decoded.startsWith("/")) return decoded;
  } catch {
    /* ignore */
  }
  return "/cabinet";
}

/** Fixed HTTPS shell for the only web_app launcher (menu button). */
export function siteMiniAppShellUrl(): string {
  return `${botConfig.siteUrl.replace(/\/$/, "")}/tg`;
}

/**
 * Deep-link into the one Main Mini App (reuses instance; does not stack web_app panels).
 * Optional short name: BOT_MINI_APP_SHORT_NAME → t.me/bot/app?startapp=
 */
export function siteMiniAppDirectUrl(pathOrUrl: string): string {
  const username = (botConfig.botUsername || "zovus_card_bot").replace(/^@/, "");
  const startapp = encodeMiniAppStartParam(pathOrUrl);
  const short = process.env.BOT_MINI_APP_SHORT_NAME?.trim();
  if (short) {
    return `https://t.me/${username}/${short}?startapp=${encodeURIComponent(startapp)}`;
  }
  return `https://t.me/${username}?startapp=${encodeURIComponent(startapp)}`;
}
