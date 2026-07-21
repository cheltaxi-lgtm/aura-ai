import type { OAuthProvider } from "./types";

export interface OAuthCallbackParams {
  code: string | null;
  state: string | null;
  deviceId: string | null;
  error: string | null;
}

function trimParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Read a query param without the URLSearchParams `+` → space transform.
 * VK device_id / code are often base64-like and contain literal `+`.
 *
 * Prefer the raw request URL (`request.url`) — NextURL.search may already
 * have normalized `+` into spaces before we see it.
 */
export function getRawQueryParam(search: string, key: string): string | null {
  const normalized = search.startsWith("?") || search.startsWith("&") ? search : `?${search}`;
  const match = normalized.match(new RegExp(`(?:^|[?&])${key}=([^&]*)`));
  if (!match) return null;
  try {
    // Preserve `+` (unlike URLSearchParams / application/x-www-form-urlencoded).
    return decodeURIComponent(match[1].replace(/\+/g, "%2B"));
  } catch {
    return match[1];
  }
}

/** Extract `?...` from a full or relative request URL, preserving raw encoding. */
export function rawSearchFromRequestUrl(requestUrl: string): string {
  const q = requestUrl.indexOf("?");
  if (q < 0) return "";
  const hash = requestUrl.indexOf("#", q);
  return hash >= 0 ? requestUrl.slice(q, hash) : requestUrl.slice(q);
}

/** VK ID returns auth data in a JSON `payload` query param (code_v2 flow). */
function parseVkPayload(search: string): OAuthCallbackParams | null {
  const payloadRaw = getRawQueryParam(search, "payload");
  if (!payloadRaw) return null;
  try {
    // Some browsers leave payload percent-encoded; try raw then decoded.
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      parsed = JSON.parse(decodeURIComponent(payloadRaw));
    }
    const payload = parsed as {
      code?: string;
      state?: string;
      device_id?: string;
      deviceId?: string;
      type?: string;
    };
    return {
      code: trimParam(payload.code),
      state: trimParam(payload.state),
      deviceId: trimParam(payload.device_id) || trimParam(payload.deviceId),
      error: trimParam(getRawQueryParam(search, "error")),
    };
  } catch {
    return null;
  }
}

function flatCallbackParams(search: string): OAuthCallbackParams {
  return {
    code: trimParam(getRawQueryParam(search, "code")),
    state: trimParam(getRawQueryParam(search, "state")),
    deviceId: trimParam(getRawQueryParam(search, "device_id")),
    error: trimParam(getRawQueryParam(search, "error")),
  };
}

/**
 * Merge payload + top-level query. VK often puts `code`/`state` in `payload`
 * while `device_id` arrives as a sibling query param (or the reverse).
 */
function mergeCallbackParams(
  primary: OAuthCallbackParams,
  fallback: OAuthCallbackParams
): OAuthCallbackParams {
  return {
    code: primary.code || fallback.code,
    state: primary.state || fallback.state,
    deviceId: primary.deviceId || fallback.deviceId,
    error: primary.error || fallback.error,
  };
}

export function parseOAuthCallbackParams(
  provider: OAuthProvider,
  url: URL | string
): OAuthCallbackParams {
  const search =
    typeof url === "string" ? rawSearchFromRequestUrl(url) : url.search || rawSearchFromRequestUrl(url.href);
  const flat = flatCallbackParams(search);
  if (provider === "vk") {
    const fromPayload = parseVkPayload(search);
    if (fromPayload) return mergeCallbackParams(fromPayload, flat);
  }
  return flat;
}
