import { Capacitor } from "@capacitor/core";
import { AppUpdateNative, type AppUpdateProgressEvent } from "@/lib/app-update-native";

const APK_CACHE_PATH = "zovus-update.apk";

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
  window.location.assign(apkUrl);
}

export async function downloadAndInstallApk(
  apkUrl: string,
  onProgress?: (percent: number) => void
): Promise<void> {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось обновить приложение";
    throw new Error(message);
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
