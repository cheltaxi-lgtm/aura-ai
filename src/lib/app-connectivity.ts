/** App shell connectivity — offline vs server/maintenance. */

export type AppConnectivityReason = "offline" | "maintenance" | "server";

const STATUS_PATH = "/api/platform/status";
const PROBE_TIMEOUT_MS = 8_000;

export type ProbeAppConnectivityOptions = {
  /** Stricter checks for launch splash — unreachable server blocks the app. */
  bootstrap?: boolean;
};

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function isNativeOffline(): Promise<boolean | null> {
  return null;
}

function parseStatusPayload(
  data: unknown
): { ok?: boolean; maintenanceMode?: boolean } {
  if (!data || typeof data !== "object") return {};
  const row = data as Record<string, unknown>;
  return {
    ok: row.ok === true ? true : row.ok === false ? false : undefined,
    maintenanceMode: row.maintenanceMode === true,
  };
}

/** Returns a block reason, or null when the app can proceed. */
export async function probeAppConnectivity(
  options?: ProbeAppConnectivityOptions
): Promise<AppConnectivityReason | null> {
  const strict = options?.bootstrap === true;

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
    const data = parseStatusPayload(await res.json().catch(() => null));
    if (data.maintenanceMode) return "maintenance";
    if (!res.ok) return strict ? "server" : null;
    if (data.ok === false && strict) return "server";
    return null;
  } catch {
    if (isBrowserOffline()) return "offline";
    return strict ? "server" : null;
  } finally {
    clearTimeout(timer);
  }
}
