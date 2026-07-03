export type AndroidReleaseInfo = {
  versionCode: number;
  versionName: string;
  minVersionCode: number;
  apkUrl: string;
  releaseNotes: string;
  playStoreUrl?: string;
  updateChannel?: "auto" | "play" | "apk";
  releaseCertSha256?: string;
  reinstallBelowVersionCode?: number;
};

const FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

/**
 * Fetches the release manifest with retries: right after app launch the
 * network stack may not be ready yet, and a single failed request must not
 * silently skip an update check.
 */
export async function fetchAndroidReleaseInfo(): Promise<AndroidReleaseInfo | null> {
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch("/api/app/android-version", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as AndroidReleaseInfo;
        if (Number.isFinite(data.versionCode) && data.versionCode >= 1) return data;
      }
    } catch {
      /* retry below */
    }
    if (attempt < FETCH_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }
  }
  return null;
}

export type InstalledAppVersion = {
  versionName: string;
  versionCode: number;
};

/** Installed app version via Capacitor; null in a regular browser. Retries while WebView boots. */
export async function getInstalledAppVersion(): Promise<InstalledAppVersion | null> {
  if (typeof window === "undefined") return null;

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const cap =
        (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor ??
        (await import("@capacitor/core")).Capacitor;
      if (!cap?.isNativePlatform?.()) return null;
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      const versionCode = Number.parseInt(String(info.build), 10);
      if (!Number.isFinite(versionCode)) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      return { versionName: info.version || "?", versionCode };
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return null;
}
