"use client";

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { fetchAuthMeWithRetry, type AuthMeResponse } from "@/lib/client-auth-session";
import { markAuthPending } from "@/lib/auth-pending";
import { flushWebViewCookies } from "@/lib/webview-cookies";

/**
 * After a successful login/OAuth response, make the auth cookie visible in WebView.
 * 1) Poll /api/auth/me
 * 2) If still not authenticated and handoff is present, consume handoff (re-sets cookie)
 * 3) Flush Android CookieManager + poll again
 *
 * Callers should still hard-navigate afterward — document loads commit cookies more reliably.
 */
export async function commitAuthSession(options?: {
  handoff?: string | null;
}): Promise<AuthMeResponse | null> {
  markAuthPending();

  let me = await fetchAuthMeWithRetry({ attempts: 4, delayMs: 250 });
  if (me?.authenticated) {
    await flushWebViewCookies();
    return me;
  }

  const handoff = options?.handoff?.trim();
  if (handoff) {
    try {
      const handoffRes = await fetchWithTimeout("/api/auth/oauth/handoff", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        timeoutMs: 12_000,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: handoff }),
      });
      if (handoffRes.ok) {
        await flushWebViewCookies();
        me = await fetchAuthMeWithRetry({ attempts: 6, delayMs: 300 });
      }
    } catch {
      /* hard navigation will still try to use Set-Cookie from login */
    }
  }

  await flushWebViewCookies();
  if (!me?.authenticated) {
    me = await fetchAuthMeWithRetry({ attempts: 4, delayMs: 350 });
  }
  return me;
}
