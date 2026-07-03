/** App shell connectivity — offline vs server/maintenance. */

export type AppConnectivityReason = "offline" | "maintenance" | "server";

const STATUS_PATH = "/api/platform/status";
const PROBE_TIMEOUT_MS = 8_000;

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function isNativeOffline(): Promise<boolean | null> {
  return null;
}

/** Returns a block reason, or null when the app can proceed. */
export async function probeAppConnectivity(): Promise<AppConnectivityReason | null> {
  if (isBrowserOffline()) return "offline";

  const nativeOffline = await isNativeOffline();
  if (nativeOffline === true) return "offline";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(STATUS_PATH, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; maintenanceMode?: boolean };
    if (data.maintenanceMode) return "maintenance";
    return null;
  } catch {
    if (isBrowserOffline()) return "offline";
    return null;
  } finally {
    clearTimeout(timer);
  }
}
