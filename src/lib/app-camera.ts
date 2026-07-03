"use client";

import { isNativeCapacitorPlatform } from "@/lib/app-shell";

export type AppPhotoSource = "camera" | "gallery";

/** Native camera/gallery via Capacitor (Android/iOS shell). Returns null if cancelled. */
export async function pickPhotoFromApp(source: AppPhotoSource): Promise<File | null> {
  if (!isNativeCapacitorPlatform()) return null;

  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    saveToGallery: false,
    correctOrientation: true,
  });

  if (!photo.webPath) return null;

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const ext = photo.format === "png" ? "png" : "jpeg";
  const mime = blob.type || (ext === "png" ? "image/png" : "image/jpeg");
  return new File([blob], `zovus-${source}-${Date.now()}.${ext}`, { type: mime });
}

export function isAppCameraAvailable(): boolean {
  return isNativeCapacitorPlatform();
}

export function appCameraErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/permission|denied|not allowed/i.test(msg)) {
    return "Нет доступа к камере. Разрешите доступ Zovus в настройках телефона.";
  }
  if (/cancel/i.test(msg)) return "";
  return "Не удалось открыть камеру. Попробуйте «Загрузить фото» или повторите позже.";
}
