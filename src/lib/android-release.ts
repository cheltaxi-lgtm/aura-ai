import { getAppUrl } from "@/lib/brand";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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
  /**
   * True when public/releases/zovus-latest.apk matches android-version.json.
   * Clients must ignore update prompts when false — prevents "update to 19" while APK is 15.
   */
  releaseConsistent: boolean;
  /** Diagnostic reason when releaseConsistent is false. */
  releaseIntegrity?: string;
};

type ManifestFile = {
  versionCode: number;
  versionName: string;
  apkSha256?: string;
  apkBytes?: number;
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function apkFilePath(): string {
  return path.join(process.cwd(), "public/releases/zovus-latest.apk");
}

function readManifestFile(): ManifestFile | null {
  try {
    const file = path.join(process.cwd(), "public/releases/android-version.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
      versionCode?: unknown;
      versionName?: unknown;
      apkSha256?: unknown;
      apkBytes?: unknown;
    };
    const versionCode = Number.parseInt(String(raw.versionCode ?? ""), 10);
    const versionName = typeof raw.versionName === "string" ? raw.versionName.trim() : "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    const apkSha256 =
      typeof raw.apkSha256 === "string" ? raw.apkSha256.trim().toLowerCase() : undefined;
    const apkBytesRaw = Number.parseInt(String(raw.apkBytes ?? ""), 10);
    return {
      versionCode,
      versionName,
      apkSha256: apkSha256 || undefined,
      apkBytes: Number.isFinite(apkBytesRaw) && apkBytesRaw > 0 ? apkBytesRaw : undefined,
    };
  } catch {
    return null;
  }
}

function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function findAapt(): string | null {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "/opt/android-sdk";
  const buildTools = path.join(home, "build-tools");
  try {
    if (!fs.existsSync(buildTools)) return null;
    const versions = fs
      .readdirSync(buildTools)
      .filter((name) => fs.existsSync(path.join(buildTools, name, "aapt")))
      .sort();
    if (!versions.length) return null;
    return path.join(buildTools, versions[versions.length - 1]!, "aapt");
  } catch {
    return null;
  }
}

function probeApkVersion(file: string): { versionCode: number; versionName: string } | null {
  const aapt = findAapt();
  if (!aapt) return null;
  try {
    const out = execFileSync(aapt, ["dump", "badging", file], {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    });
    const line = out.split("\n").find((l) => l.startsWith("package:")) ?? "";
    const versionCode = Number.parseInt(line.match(/versionCode='(\d+)'/)?.[1] ?? "", 10);
    const versionName = line.match(/versionName='([^']+)'/)?.[1]?.trim() ?? "";
    if (!Number.isFinite(versionCode) || versionCode < 1 || !versionName) return null;
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

type Downloadable = {
  versionCode: number;
  versionName: string;
  consistent: boolean;
  integrity: string;
};

/**
 * Downloadable version = APK on disk. Metadata may not raise versionCode above the file.
 */
function resolveDownloadable(): Downloadable | null {
  const apk = apkFilePath();
  const manifest = readManifestFile();
  if (!fs.existsSync(apk)) {
    return manifest
      ? {
          versionCode: manifest.versionCode,
          versionName: manifest.versionName,
          consistent: false,
          integrity: "missing_apk",
        }
      : null;
  }

  let hash = "";
  let size = 0;
  try {
    hash = sha256File(apk);
    size = fs.statSync(apk).size;
  } catch {
    return null;
  }

  const probed = probeApkVersion(apk);

  if (manifest?.apkSha256) {
    const hashOk = hash === manifest.apkSha256;
    const sizeOk = !manifest.apkBytes || manifest.apkBytes === size;
    if (hashOk && sizeOk) {
      if (probed && probed.versionCode !== manifest.versionCode) {
        return {
          versionCode: probed.versionCode,
          versionName: probed.versionName,
          consistent: false,
          integrity: "manifest_apk_version_mismatch",
        };
      }
      return {
        versionCode: manifest.versionCode,
        versionName: manifest.versionName,
        consistent: true,
        integrity: "ok",
      };
    }
    if (probed) {
      return {
        versionCode: probed.versionCode,
        versionName: probed.versionName,
        consistent: false,
        integrity: "hash_mismatch",
      };
    }
    return {
      versionCode: manifest.versionCode,
      versionName: manifest.versionName,
      consistent: false,
      integrity: "hash_mismatch",
    };
  }

  // Legacy sidecar without hash: prefer aapt; mark inconsistent until republished.
  if (probed) {
    const matches = Boolean(manifest && probed.versionCode === manifest.versionCode);
    return {
      versionCode: probed.versionCode,
      versionName: probed.versionName,
      consistent: matches,
      integrity: matches ? "aapt_matches_manifest" : "legacy_no_hash",
    };
  }

  if (manifest) {
    return {
      versionCode: manifest.versionCode,
      versionName: manifest.versionName,
      consistent: false,
      integrity: "unverified_legacy_manifest",
    };
  }

  return null;
}

export function readAndroidReleaseConfig(): AndroidReleaseConfig {
  const base = getAppUrl();
  const downloadable = resolveDownloadable();
  const envCode = parseIntEnv("ANDROID_VERSION_CODE", 0);
  const envName = process.env.ANDROID_VERSION_NAME?.trim() ?? "";

  // Never let env/gradle inflate the advertised downloadable build above the APK.
  let versionCode = downloadable?.versionCode ?? (envCode >= 1 ? envCode : 1);
  let versionName =
    downloadable?.versionName ?? (envName || "1.0.0");
  let releaseConsistent = downloadable?.consistent ?? false;
  let releaseIntegrity = downloadable?.integrity ?? "no_release_metadata";

  if (downloadable && envCode > downloadable.versionCode) {
    releaseConsistent = false;
    releaseIntegrity = `env_ahead_of_apk:${envCode}>${downloadable.versionCode}`;
    versionCode = downloadable.versionCode;
    versionName = downloadable.versionName;
  }

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
  const releaseCertSha256 =
    process.env.ANDROID_ASSETLINKS_SHA256?.trim().replace(/:/g, "") || undefined;
  const reinstallBelowVersionCode = parseIntEnv("ANDROID_REINSTALL_BELOW_CODE", 13);

  // Forced min must never exceed what we can actually download.
  const safeMin = Math.min(minVersionCode, versionCode);

  return {
    versionCode,
    versionName,
    minVersionCode: safeMin,
    apkUrl,
    releaseNotes,
    playStoreUrl,
    updateChannel,
    releaseCertSha256,
    reinstallBelowVersionCode,
    releaseConsistent,
    releaseIntegrity,
  };
}
