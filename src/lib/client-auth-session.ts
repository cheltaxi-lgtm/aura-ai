"use client";

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

export type AuthMeResponse = {
  authenticated?: boolean;
  needsProfile?: boolean;
  user?: {
    sub?: string;
    role?: string;
    email?: string;
    name?: string;
    profileUserId?: string | null;
    oauthGender?: "male" | "female" | null;
  } | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Poll /api/auth/me until cookie is visible in WebView (or attempts exhausted). */
export async function fetchAuthMeWithRetry(options?: {
  attempts?: number;
  delayMs?: number;
  timeoutMs?: number;
}): Promise<AuthMeResponse | null> {
  const attempts = options?.attempts ?? 5;
  const delayMs = options?.delayMs ?? 300;
  const timeoutMs = options?.timeoutMs ?? 10_000;

  let last: AuthMeResponse | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        timeoutMs,
      });
      if (res.ok) {
        last = (await res.json()) as AuthMeResponse;
        if (last.authenticated) return last;
      }
    } catch {
      /* retry */
    }
    if (attempt < attempts - 1) await sleep(delayMs * (attempt + 1));
  }
  return last;
}

/** Confirm logout stuck: cookie must be gone before navigating away. */
export async function waitUntilLoggedOut(options?: {
  attempts?: number;
  delayMs?: number;
  timeoutMs?: number;
}): Promise<boolean> {
  const attempts = options?.attempts ?? 5;
  const delayMs = options?.delayMs ?? 250;
  const timeoutMs = options?.timeoutMs ?? 8_000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout("/api/auth/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        timeoutMs,
      });
      if (res.ok) {
        const data = (await res.json()) as AuthMeResponse;
        if (!data.authenticated) return true;
      }
    } catch {
      /* treat as logged out only after retries */
    }
    if (attempt < attempts - 1) await sleep(delayMs * (attempt + 1));
  }
  return false;
}
