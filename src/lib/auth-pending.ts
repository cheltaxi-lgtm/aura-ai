"use client";

import { appShellNavigationOrigin } from "@/lib/app-shell";

export const AUTH_PENDING_KEY = "zovus_auth_pending";

/** Mark that a login just happened — useAuth should keep polling until cookie sticks. */
export function markAuthPending(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_PENDING_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function clearAuthPending(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(AUTH_PENDING_KEY);
  } catch {
    /* private mode */
  }
}

export function isAuthPending(maxAgeMs = 30_000): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(AUTH_PENDING_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return true;
    if (Date.now() - ts > maxAgeMs) {
      sessionStorage.removeItem(AUTH_PENDING_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function hasAuthPendingQuery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("_auth");
  } catch {
    return false;
  }
}

/** Keep ?app=1 when landing after auth inside the native shell. */
export function withAppShellAuthParams(destination: string): string {
  const { appShellNavigationOrigin } = require("@/lib/app-shell") as typeof import("@/lib/app-shell");
  const url = new URL(destination, appShellNavigationOrigin());
  try {
    if (sessionStorage.getItem("zovus_app_shell") === "1") {
      url.searchParams.set("app", "1");
    }
  } catch {
    /* ignore */
  }
  if (new URLSearchParams(window.location.search).get("app") === "1") {
    url.searchParams.set("app", "1");
  }
  url.searchParams.set("_auth", String(Date.now()));
  return `${url.pathname}${url.search}${url.hash}`;
}

export function stripAuthPendingQuery(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("_auth")) return;
    url.searchParams.delete("_auth");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next || "/");
  } catch {
    /* ignore */
  }
}
