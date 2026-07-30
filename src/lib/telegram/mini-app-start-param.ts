/**
 * Compact startapp payloads for the single Main Mini App.
 * Telegram allows 1–64 chars: A-Z a-z 0-9 _ -
 *
 * Prefer short aliases; fall back to base64url of a cleaned path.
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
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(param: string): string | null {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(param, "base64url").toString("utf8");
    }
    const pad = param.length % 4 === 0 ? "" : "=".repeat(4 - (param.length % 4));
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function uuidFromCompact(hex32: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(hex32)) return null;
  const h = hex32.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Encode a site path into a startapp payload (or null if unsafe / too long). */
export function encodeMiniAppStartParam(pathOrUrl: string): string {
  let path = (pathOrUrl || "/cabinet").trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      path = `${u.pathname}${u.search}${u.hash}` || "/cabinet";
    }
  } catch {
    path = "/cabinet";
  }
  if (!path.startsWith("/")) path = "/cabinet";
  path = stripTrackingParams(path);

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
    if (u.pathname.startsWith("/auth/telegram-link")) return "link";
  } catch {
    /* fall through */
  }

  const encoded = b64urlEncode(path);
  if (STARTAPP_RE.test(encoded)) return encoded;
  return "cabinet";
}

/** Decode startapp / tgWebAppStartParam into a site path (unsanitized — pass through sanitizeMiniAppPath). */
export function decodeMiniAppStartParam(raw: string | null | undefined): string | null {
  const param = (raw || "").trim();
  if (!param || !STARTAPP_RE.test(param)) return null;

  if (param === "cabinet") return "/cabinet";
  if (param === "shop") return "/cabinet?shop=1";
  if (param === "home") return "/";
  if (param === "photo") return "/photo-rasklad";
  if (param === "link") return "/cabinet";

  if (param.startsWith("chat_")) {
    const uuid = uuidFromCompact(param.slice("chat_".length));
    if (uuid) return `/?chat_session=${uuid}`;
  }

  const decoded = b64urlDecode(param);
  if (!decoded || !decoded.startsWith("/")) return null;
  return decoded;
}
