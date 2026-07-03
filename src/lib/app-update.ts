import { Capacitor } from "@capacitor/core";
import { isAllowedApkDownloadUrl } from "@/lib/allowed-hosts";
import {
  isSignatureMismatchError,
  normalizeUpdateError,
  REINSTALL_UPDATE_HINT,
  UPDATE_SIGNATURE_MISMATCH,
} from "@/lib/app-update-errors";
import { AppUpdateNative, type AppUpdateProgressEvent } from "@/lib/app-update-native";

const APK_CACHE_PATH = "zovus-update.apk";

function readErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  return fallback;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function downloadApkJs(
  apkUrl: string,
  onProgress?: (percent: number) => void
): Promise<ArrayBuffer> {
  onProgress?.(1);
  const res = await fetch(apkUrl, { cache: "no-store", credentials: "omit" });
  if (!res.ok) throw new Error("Не удалось скачать обновление");

  const total = Number.parseInt(res.headers.get("content-length") || "0", 10);
  const body = res.body;
  if (!body) {
    const buffer = await res.arrayBuffer();
    onProgress?.(100);
    return buffer;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) {
        onProgress?.(Math.min(99, Math.round((received / total) * 100)));
      } else if (received > 0) {
        onProgress?.(Math.min(95, Math.round(received / 80_000)));
      }
    }
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress?.(100);
  return merged.buffer;
}

async function downloadViaNativePlugin(
  apkUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  let handle: { remove: () => void } | undefined;
  try {
    handle = await AppUpdateNative.addListener(
      "downloadProgress",
      (event: AppUpdateProgressEvent) => {
        if (typeof event.percent === "number") {
          onProgress?.(Math.min(99, event.percent));
        }
      }
    );
    await AppUpdateNative.downloadAndInstall({ url: apkUrl });
    onProgress?.(100);
  } finally {
    handle?.remove();
  }
}

export async function openPlayStoreUpdate(playStoreUrl?: string): Promise<void> {
  const url =
    playStoreUrl?.trim() ||
    "https://play.google.com/store/apps/details?id=ru.zovus.app";
  if (Capacitor.isNativePlatform()) {
    try {
      await AppUpdateNative.openPlayStore({ url });
      return;
    } catch {
      /* fallback */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openApkDownloadPage(apkUrl: string): void {
  void openApkDownloadPageAsync(apkUrl);
}

export async function openApkDownloadPageAsync(apkUrl: string): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    try {
      await AppUpdateNative.openExternalUrl({ url: apkUrl });
      return;
    } catch {
      /* fallback below */
    }
  }
  window.open(apkUrl, "_blank", "noopener,noreferrer");
}

export function markUpdateInstallFailed(versionCode: number): void {
  try {
    sessionStorage.setItem(`zovus_update_install_failed_v${versionCode}`, "1");
    localStorage.setItem(`zovus_update_install_failed_v${versionCode}`, "1");
  } catch {
    /* ignore */
  }
}

export function hadUpdateInstallFailed(versionCode: number): boolean {
  try {
    return (
      sessionStorage.getItem(`zovus_update_install_failed_v${versionCode}`) === "1" ||
      localStorage.getItem(`zovus_update_install_failed_v${versionCode}`) === "1"
    );
  } catch {
    return false;
  }
}

function normalizeCertSha256(value: string): string {
  return value.trim().replace(/:/g, "").toUpperCase();
}

export async function installedCertMatchesRelease(expectedSha256?: string): Promise<boolean | null> {
  if (!expectedSha256?.trim()) return null;
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  try {
    const { sha256 } = await AppUpdateNative.getInstalledCertSha256();
    return normalizeCertSha256(sha256) === normalizeCertSha256(expectedSha256);
  } catch {
    return null;
  }
}

export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  if (!isAllowedApkDownloadUrl(apkUrl)) {
    throw new Error("Недопустимый адрес обновления");
  }
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    window.location.assign(apkUrl);
    return;
  }

  try {
    await downloadViaNativePlugin(apkUrl, onProgress);
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("неизвестных источников") || message.includes("Unknown sources")) {
      throw new Error(message);
    }
    throw new Error(normalizeUpdateError(message));
  }

  try {
    const buffer = await downloadApkJs(apkUrl, onProgress);
    const { Filesystem, Directory } = await import("@capacitor/filesystem");

    await Filesystem.writeFile({
      path: APK_CACHE_PATH,
      data: arrayBufferToBase64(buffer),
      directory: Directory.Cache,
      recursive: true,
    });

    const { uri } = await Filesystem.getUri({
      path: APK_CACHE_PATH,
      directory: Directory.Cache,
    });

    await AppUpdateNative.installApk({ uri });
    onProgress?.(100);
  } catch (err: unknown) {
    throw new Error(normalizeUpdateError(readErrorMessage(err, "Не удалось обновить приложение")));
  }
}

export function dismissOptionalUpdate(versionCode: number): void {
  try {
    sessionStorage.setItem(`zovus_update_dismiss_v${versionCode}`, "1");
  } catch {
    /* ignore */
  }
}

export function isOptionalUpdateDismissed(versionCode: number): boolean {
  try {
    return sessionStorage.getItem(`zovus_update_dismiss_v${versionCode}`) === "1";
  } catch {
    return false;
  }
}

const FORCED_GRACE_MS = 24 * 60 * 60 * 1000;

export function grantForcedUpdateGrace(versionCode: number): void {
  try {
    sessionStorage.setItem(`zovus_forced_update_grace_v${versionCode}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export async function openAppUninstallSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await AppUpdateNative.openAppDetails();
      return;
    } catch {
      /* fallback */
    }
    try {
      await AppUpdateNative.openExternalUrl({
        url: `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${Capacitor.getPlatform() === "android" ? "ru.zovus.app" : ""};end`,
      });
    } catch {
      /* manual instructions only */
    }
  }
}

export function isForcedUpdateGraceActive(versionCode: number): boolean {
  try {
    const raw = sessionStorage.getItem(`zovus_forced_update_grace_v${versionCode}`);
    if (!raw) return false;
    const started = Number.parseInt(raw, 10);
    if (!Number.isFinite(started)) return false;
    return Date.now() - started < FORCED_GRACE_MS;
  } catch {
    return false;
  }
}

export { REINSTALL_UPDATE_HINT, UPDATE_SIGNATURE_MISMATCH, isSignatureMismatchError };
