/** Browser-only display cache. Never grants a free reading. Photo is not sent to the server. */

const STORAGE_KEY = "zovus_palm_preview_v1";
const MAX_DATA_URL_CHARS = 900_000;

type PalmPreviewStore = {
  snapshotId: string;
  dataUrl: string;
};

function asStore(raw: string | null): PalmPreviewStore | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PalmPreviewStore>;
    if (
      typeof parsed.snapshotId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.snapshotId) ||
      typeof parsed.dataUrl !== "string" ||
      !parsed.dataUrl.startsWith("data:image/") ||
      parsed.dataUrl.length > MAX_DATA_URL_CHARS
    ) {
      return null;
    }
    return { snapshotId: parsed.snapshotId, dataUrl: parsed.dataUrl };
  } catch {
    return null;
  }
}

export function readPalmPreview(snapshotId: string | null | undefined): string | null {
  if (!snapshotId || typeof window === "undefined") return null;
  const store =
    asStore(window.sessionStorage.getItem(STORAGE_KEY)) ??
    asStore(window.localStorage.getItem(STORAGE_KEY));
  return store?.snapshotId === snapshotId ? store.dataUrl : null;
}

export function writePalmPreview(snapshotId: string, dataUrl: string): void {
  if (typeof window === "undefined") return;
  if (!/^[0-9a-f-]{36}$/i.test(snapshotId)) return;
  if (!dataUrl.startsWith("data:image/") || dataUrl.length > MAX_DATA_URL_CHARS) return;
  const payload = JSON.stringify({ snapshotId, dataUrl });
  try {
    window.sessionStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* quota */
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    /* quota — session copy is enough for this tab */
  }
}

export function clearPalmPreview(snapshotId?: string | null): void {
  if (typeof window === "undefined") return;
  if (snapshotId) {
    const store =
      asStore(window.sessionStorage.getItem(STORAGE_KEY)) ??
      asStore(window.localStorage.getItem(STORAGE_KEY));
    if (store && store.snapshotId !== snapshotId) return;
  }
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(STORAGE_KEY);
}

export function revokePalmObjectUrl(url: string | null | undefined): void {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function blobToPalmDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("preview_read_failed"));
    reader.readAsDataURL(blob);
  });
}
