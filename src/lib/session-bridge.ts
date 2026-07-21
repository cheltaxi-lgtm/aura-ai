import { appShellNavigationOrigin, isNativeCapacitorPlatform } from "@/lib/app-shell";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

/** Build document navigation that re-sets aura_auth via Set-Cookie on the redirect. */
export function buildSessionBridgeUrl(token: string, destination: string): string {
  const to = sanitizeReturnTo(destination, "/");
  const params = new URLSearchParams({
    token: token.trim(),
    to,
  });
  return `/api/auth/session-bridge?${params.toString()}`;
}

export async function mintSessionBridgeToken(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout("/api/auth/session-bridge", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      timeoutMs: 12_000,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    const token = typeof data.token === "string" ? data.token.trim() : "";
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Hard-navigate through the session bridge when possible.
 * Android WebView often applies Set-Cookie from fetch to XHR only — document
 * loads then look logged-out until CookieManager flush (or this bridge).
 */
export async function navigateViaSessionBridge(
  destination: string,
  existingToken?: string | null
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const to = sanitizeReturnTo(destination, "/");
  let token = existingToken?.trim() || "";
  if (!token) {
    token = (await mintSessionBridgeToken()) || "";
  }
  if (!token) return false;
  const url = new URL(buildSessionBridgeUrl(token, to), appShellNavigationOrigin());
  window.location.assign(url.toString());
  return true;
}

/** True when native WebView must prefer document cookie bridge over bare hard-nav.
 * Desktop browser must NOT use the bridge — OAuth callback already Set-Cookie on
 * the document redirect; bridge mint/nav is a common hang ("Завершаем вход…" forever
 * until manual refresh, which then sees the cookie).
 */
export function shouldUseSessionBridge(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeCapacitorPlatform();
}
