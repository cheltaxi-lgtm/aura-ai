import { getAppUrl } from "@/lib/brand";

export type AndroidReleaseConfig = {
  versionCode: number;
  versionName: string;
  minVersionCode: number;
  apkUrl: string;
  releaseNotes: string;
  playStoreUrl?: string;
  updateChannel: "auto" | "play" | "apk";
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function readAndroidReleaseConfig(): AndroidReleaseConfig {
  const base = getAppUrl();
  const versionCode = parseIntEnv("ANDROID_VERSION_CODE", 1);
  const versionName = process.env.ANDROID_VERSION_NAME?.trim() || "1.0.0";
  const minVersionCode = parseIntEnv("ANDROID_MIN_VERSION_CODE", 1);
  const apkUrl =
    process.env.ANDROID_APK_URL?.trim() ||
    process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() ||
    `${base}/releases/zovus-latest.apk`;
  const releaseNotes =
    process.env.ANDROID_RELEASE_NOTES?.trim() ||
    "Официальное приложение Zovus для Android.";
  const playStoreUrl =
    process.env.ANDROID_PLAY_STORE_URL?.trim() ||
    process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL?.trim() ||
    undefined;
  const channelRaw = process.env.ANDROID_UPDATE_CHANNEL?.trim()?.toLowerCase();
  const updateChannel =
    channelRaw === "play" || channelRaw === "apk" || channelRaw === "auto"
      ? channelRaw
      : "auto";

  return { versionCode, versionName, minVersionCode, apkUrl, releaseNotes, playStoreUrl, updateChannel };
}
