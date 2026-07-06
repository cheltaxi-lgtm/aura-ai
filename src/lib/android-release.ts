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
  releaseCertSha256?: string;
  /** Builds below this code must uninstall + reinstall (debug-signed legacy APKs). */
  reinstallBelowVersionCode?: number;
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

function readEnvVersion(): { versionCode: number; versionName: string } | null {
  const versionCode = parseIntEnv("ANDROID_VERSION_CODE", 0);
  const versionName = process.env.ANDROID_VERSION_NAME?.trim() ?? "";
  if (versionCode < 1 || !versionName) return null;
  return { versionCode, versionName };
}

export function readAndroidReleaseConfig(): AndroidReleaseConfig {
  const base = getAppUrl();
  const built = readBuiltManifest();
  const gradle = readGradleVersion();
  const env = readEnvVersion();
  // versionCode source of truth: the max of every place it can live (mirrors
  // hosting/build-android-apk.sh's own reasoning). public/releases/*.json and
  // mobile/android/app/build.gradle are checked into git and get overwritten
  // by every code deploy with whatever was last committed, so on their own
  // they can go backwards after a server-side APK build bumped them past what
  // the dev machine has. ANDROID_VERSION_CODE in .env.local is never touched
  // by a code deploy (deploys explicitly exclude .env.local), so taking the
  // max keeps the reported "latest build" monotonic across deploys.
  const winner = [built, gradle, env].reduce<{ versionCode: number; versionName: string } | null>(
    (max, candidate) =>
      candidate && (!max || candidate.versionCode > max.versionCode) ? candidate : max,
    null
  );
  const versionCode = winner?.versionCode ?? parseIntEnv("ANDROID_VERSION_CODE", 1);
  const versionName = winner?.versionName ?? (process.env.ANDROID_VERSION_NAME?.trim() || "1.0.0");
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
  const releaseCertSha256 = process.env.ANDROID_ASSETLINKS_SHA256?.trim().replace(/:/g, "") || undefined;
  const reinstallBelowVersionCode = parseIntEnv("ANDROID_REINSTALL_BELOW_CODE", 13);

  return {
    versionCode,
    versionName,
    minVersionCode,
    apkUrl,
    releaseNotes,
    playStoreUrl,
    updateChannel,
    releaseCertSha256,
    reinstallBelowVersionCode,
  };
}
