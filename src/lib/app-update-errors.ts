export const UPDATE_SIGNATURE_MISMATCH = "SIGNATURE_MISMATCH";

export function isSignatureMismatchError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes(UPDATE_SIGNATURE_MISMATCH) ||
    lower.includes("конфликт") ||
    lower.includes("conflict") ||
    lower.includes("signatures do not match") ||
    lower.includes("signature_mismatch") ||
    lower.includes("update incompatible") ||
    lower.includes("конфликтует с уже установленным") ||
    lower.includes("package conflicts") ||
    lower.includes("не совместим") ||
    lower.includes("not compatible")
  );
}

export function normalizeUpdateError(raw: string): string {
  const trimmed = raw
    .replace(/^download failed:\s*/i, "")
    .replace(/^install failed:\s*/i, "")
    .trim();
  if (isSignatureMismatchError(trimmed)) {
    return UPDATE_SIGNATURE_MISMATCH;
  }
  return trimmed || "Не удалось обновить приложение";
}

export const REINSTALL_UPDATE_HINT =
  "Обновление поверх не получится — на телефоне старая сборка с другой подписью. " +
  "1) Настройки → Приложения → Zovus → Удалить. " +
  "2) Откройте Chrome и перейдите на zovus.ru/releases/zovus-latest.apk. " +
  "3) Установите APK. Данные аккаунта сохранятся на сервере.";

/** First release-signed build; everything below must reinstall via browser. */
export const LEGACY_REINSTALL_BELOW_BUILD = 13;
