import { getAppUrl } from "@/lib/brand";
import fs from "node:fs";
import path from "node:path";

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

function readBuiltManifest(): { versionCode: number; versionName: string } | null {
  try {
    const file = path.join(process.cwd(), "public/releases/android-version.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      versionCode?: unknown;
      versionName?: unknown;
    };
    const versionCode = Number.parseInt(String(raw.versionCode ?? ""), 10);
    const versionName = typeof raw.versionName === "string" ? raw.versionName.trim() : "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

function readGradleVersion(): { versionCode: number; versionName: string } | null {
  try {
    const file = path.join(process.cwd(), "mobile/android/app/build.gradle");
    const text = fs.readFileSync(file, "utf8");
    const versionCode = Number.parseInt(text.match(/versionCode\s+(\d+)/)?.[1] ?? "", 10);
    const versionName = text.match(/versionName\s+"([^"]+)"/)?.[1]?.trim() ?? "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

export function readAndroidReleaseConfig(): AndroidReleaseConfig {
  const base = getAppUrl();
  const built = readBuiltManifest();
  const gradle = readGradleVersion();
  const versionCode =
    built?.versionCode ?? gradle?.versionCode ?? parseIntEnv("ANDROID_VERSION_CODE", 1);
  const versionName =
    built?.versionName ??
    gradle?.versionName ??
    (process.env.ANDROID_VERSION_NAME?.trim() || "1.0.0");
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
