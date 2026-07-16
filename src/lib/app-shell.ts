/** Detect Zovus Android/iOS shell (Capacitor WebView or ?app=1 deep link). */
export const APP_SHELL_QUERY = "app";
export const APP_SHELL_VALUE = "1";
export const APP_SHELL_HEADER = "x-zovus-app";

export function isAppShellSearchParam(search: string): boolean {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.get(APP_SHELL_QUERY) === APP_SHELL_VALUE;
  } catch {
    return false;
  }
}

/** Client-only: Capacitor native platform or persisted app-shell flag. */
export function isNativeCapacitorPlatform(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function readAppShellFromDocument(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.appShell === "android";
}

export function markAppShellOnDocument(): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.appShell = "android";
  if (isNativeCapacitorPlatform()) {
    document.documentElement.dataset.nativeApp = "1";
  }
  try {
    sessionStorage.setItem("zovus_app_shell", "1");
  } catch {
    /* private mode */
  }
}

export function shouldUseAppShellClient(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeCapacitorPlatform()) return true;
  if (isAppShellSearchParam(window.location.search)) return true;
  try {
    return sessionStorage.getItem("zovus_app_shell") === "1";
  } catch {
    return false;
  }
}

const SPLASH_DONE_KEY = "zovus_splash_done";

/** Launch splash already finished this app session (survives in-app full reloads). */
export function isAppShellSplashDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SPLASH_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAppShellSplashDone(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SPLASH_DONE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function appShellStartUrl(baseUrl?: string): string {
  const base = (baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://zovus.ru").replace(/\/$/, "");
  return `${base}/?${APP_SHELL_QUERY}=${APP_SHELL_VALUE}`;
}

/** Production canonical origin — never localhost. */
export function appShellCanonicalOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "https://zovus.ru").trim().replace(/\/$/, "");
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return "https://zovus.ru";
    }
    return url.origin;
  } catch {
    return "https://zovus.ru";
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Base origin for in-app navigation / OAuth.
 * Native shell must never resolve relative URLs against a baked localhost origin.
 */
export function appShellNavigationOrigin(): string {
  if (typeof window === "undefined") return appShellCanonicalOrigin();
  try {
    const { hostname, origin } = window.location;
    if (isNativeCapacitorPlatform() && isLoopbackHostname(hostname)) {
      return appShellCanonicalOrigin();
    }
    return origin;
  } catch {
    return appShellCanonicalOrigin();
  }
}
