"use client";

import { isNativeCapacitorPlatform } from "@/lib/app-shell";

export type AppPhotoSource = "camera" | "gallery";

/**
 * Native camera/gallery calls have been observed to silently hang on some
 * Android versions (no permission dialog, no error, no photo — see
 * ionic-team/capacitor-plugins#2140, #2339): the promise from
 * Camera.getPhoto() simply never settles. Without a hard timeout that looks
 * to the user exactly like "камера не открывается" with zero feedback. 20s
 * is generous for a user actually taking a photo, but short enough to not
 * feel broken if the native call really is stuck.
 */
const CAMERA_TIMEOUT_MS = 20_000;
const PERMISSION_CHECK_TIMEOUT_MS = 4_000;

class AppCameraTimeoutError extends Error {
  constructor(message = "camera_timeout") {
    super(message);
    this.name = "AppCameraTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Native camera/gallery via Capacitor (Android/iOS shell). Returns null if cancelled. */
export async function pickPhotoFromApp(source: AppPhotoSource): Promise<File | null> {
  if (!isNativeCapacitorPlatform()) return null;

  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

  // Best-effort, non-blocking permission pre-check: if we already know access
  // is denied, fail fast with a clear message instead of letting getPhoto()
  // hang or bounce silently. Never let this check itself block the flow —
  // checkPermissions() has its own history of misbehaving on some Android
  // versions, so any failure/timeout here just falls through to getPhoto().
  if (source === "camera") {
    try {
      const status = await withTimeout(
        Camera.checkPermissions(),
        PERMISSION_CHECK_TIMEOUT_MS,
        () => new AppCameraTimeoutError("permission_check_timeout")
      );
      if (status.camera === "denied") {
        throw new Error("permission denied: camera access blocked in phone settings");
      }
    } catch (err) {
      if (err instanceof Error && /blocked in phone settings/.test(err.message)) throw err;
      // checkPermissions itself failed/timed out — proceed and let getPhoto() try.
    }
  }

  const photo = await withTimeout(
    Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.Uri,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
      saveToGallery: false,
      correctOrientation: true,
    }),
    CAMERA_TIMEOUT_MS,
    () => new AppCameraTimeoutError(`${source}_timeout`)
  );

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
  if (err instanceof AppCameraTimeoutError) {
    return "Камера не отвечает. Проверьте разрешение «Камера» для Zovus в настройках телефона и попробуйте снова, либо загрузите фото из галереи.";
  }
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | undefined)?.code;
  if (code === "OS-PLUG-CAMR-0007") return "На устройстве не найдена камера.";
  if (code === "OS-PLUG-CAMR-0003" || code === "OS-PLUG-CAMR-0005" || /permission|denied|not allowed/i.test(msg)) {
    return "Нет доступа к камере. Разрешите доступ Zovus в настройках телефона.";
  }
  if (code === "OS-PLUG-CAMR-0006" || /cancel/i.test(msg)) return "";
  return "Не удалось открыть камеру. Попробуйте «Загрузить фото» или повторите позже.";
}

/** Machine-readable failure reason for telemetry — kept separate from the human-facing message above. */
export function appCameraErrorReason(err: unknown): string {
  if (err instanceof AppCameraTimeoutError) return err.message;
  const code = (err as { code?: string } | undefined)?.code;
  if (code) return code;
  return err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
}
