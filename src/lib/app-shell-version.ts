export type AndroidReleaseInfo = {
  versionCode: number;
  versionName: string;
  minVersionCode: number;
  apkUrl: string;
  releaseNotes: string;
  playStoreUrl?: string;
  updateChannel?: "auto" | "play" | "apk";
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

/** Installed app version via Capacitor; null in a regular browser. */
export async function getInstalledAppVersion(): Promise<InstalledAppVersion | null> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const versionCode = Number.parseInt(String(info.build), 10);
    if (!Number.isFinite(versionCode)) return null;
    return { versionName: info.version, versionCode };
  } catch {
    return null;
  }
}
