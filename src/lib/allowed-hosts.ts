/** Hostnames allowed for APK downloads and app-shell deep links. */
const ALLOWED_HOSTS = new Set(["zovus.ru", "www.zovus.ru"]);

export function isAllowedAppHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return host.endsWith(".zovus.ru");
}

export function isAllowedApkDownloadUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (!isAllowedAppHost(url.hostname)) return false;
    return url.pathname.startsWith("/releases/") && url.pathname.endsWith(".apk");
  } catch {
    return false;
  }
}

export function resolveAppShellDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol === "zovus:" && url.host === "open") {
      const path = url.pathname && url.pathname !== "/" ? url.pathname : "/";
      const target = new URL(`https://zovus.ru${path}`);
      target.search = url.search;
      // OAuth handoff may live in the fragment — must survive into the WebView URL.
      target.hash = url.hash;
      target.searchParams.set("app", "1");
      return target.toString();
    }
    if (isAllowedAppHost(url.hostname)) {
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (!url.searchParams.has("app")) url.searchParams.set("app", "1");
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}
