/** App shell connectivity — offline vs server/maintenance. */

export type AppConnectivityReason = "offline" | "maintenance" | "server";

const STATUS_PATH = "/api/platform/status";
const PROBE_TIMEOUT_MS = 4_000;
const STATUS_PROBE_ATTEMPTS = 3;
const STATUS_PROBE_RETRY_MS = 500;
const NATIVE_NETWORK_TIMEOUT_MS = 2_500;
const NATIVE_OFFLINE_CONFIRM_MS = 600;

export type ProbeAppConnectivityOptions = {
  /** Launch splash — only maintenance (remote page load already proves reachability). */
  bootstrap?: boolean;
  /** Ignored — kept for call-site compatibility. */
  allowServerBlock?: boolean;
};

type NetworkPlugin = {
  getStatus: () => Promise<{ connected: boolean }>;
};

function getNetworkPlugin(): NetworkPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { Network?: NetworkPlugin } };
    }
  ).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Network ?? null;
}

export function isNativeCapacitorClient(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

function resolveStatusUrl(): string {
  if (typeof window === "undefined") return STATUS_PATH;
  return `${window.location.origin}${STATUS_PATH}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(null);
      });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Android WebView often keeps navigator.onLine=true in airplane mode — use Capacitor Network. */
export async function getNativeNetworkConnected(): Promise<boolean | null> {
  const plugin = getNetworkPlugin();
  if (!plugin?.getStatus) return null;
  const status = await withTimeout(plugin.getStatus(), NATIVE_NETWORK_TIMEOUT_MS);
  if (!status) return null;
  return status.connected;
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

async function isNativeOffline(): Promise<boolean | null> {
  const connected = await getNativeNetworkConnected();
  if (connected === null) return null;
  return !connected;
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

async function probeStatusEndpointOnce(
  options?: ProbeAppConnectivityOptions
): Promise<AppConnectivityReason | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(resolveStatusUrl(), {
      cache: "no-store",
      signal: controller.signal,
    });
    const data = parseStatusPayload(await res.json().catch(() => null));
    if (data.maintenanceMode) return "maintenance";
    if (res.ok && data.ok !== false) return null;

    /* Transient backend slowness — not a hard offline signal. */
    if (res.status === 503 || res.status === 502 || res.status === 504 || res.status === 429) {
      return null;
    }

    if (data.ok === false) return null;

    if (!res.ok) {
      return options?.bootstrap || !isNativeCapacitorClient() ? null : "server";
    }
    return null;
  } catch {
    return options?.bootstrap || !isNativeCapacitorClient() ? null : "server";
  } finally {
    clearTimeout(timer);
  }
}

/** Retry transient status failures (resume from background, cold radio, brief 503). */
async function probeStatusEndpoint(
  options?: ProbeAppConnectivityOptions
): Promise<AppConnectivityReason | null> {
  for (let attempt = 0; attempt < STATUS_PROBE_ATTEMPTS; attempt += 1) {
    const reason = await probeStatusEndpointOnce(options);
    if (reason === null || reason === "maintenance") return reason;
    if (attempt < STATUS_PROBE_ATTEMPTS - 1) {
      await sleep(STATUS_PROBE_RETRY_MS);
    } else {
      return reason;
    }
  }
  return null;
}

async function probeRuntimeOffline(): Promise<AppConnectivityReason | null> {
  if (isBrowserOffline()) return "offline";

  const nativeOffline = await isNativeOffline();
  if (nativeOffline !== true) return null;

  await sleep(NATIVE_OFFLINE_CONFIRM_MS);
  if (isBrowserOffline()) return "offline";

  const nativeOfflineAgain = await isNativeOffline();
  if (nativeOfflineAgain === true) return "offline";
  return null;
}

/**
 * Returns a block reason, or null when the app can proceed.
 *
 * Trust model: a successful /api/platform/status response means the app is
 * online — do NOT second-guess with Capacitor Network (it false-negatives on
 * Wi‑Fi↔LTE handoff, screen wake, etc.). Offline is shown only when the status
 * probe fails AND native/browser signals agree there is no network.
 */
export async function probeAppConnectivity(
  options?: ProbeAppConnectivityOptions
): Promise<AppConnectivityReason | null> {
  const status = await probeStatusEndpoint(options);
  if (status === "maintenance") return status;
  if (status === null) return null;

  if (options?.bootstrap) return null;

  const offline = await probeRuntimeOffline();
  if (offline === "offline") return "offline";
  return status;
}

/** Splash bootstrap probe — never block on transient offline signals at cold start. */
export async function probeAppBootstrapConnectivity(): Promise<AppConnectivityReason | null> {
  const attempts = 2;
  for (let i = 0; i < attempts; i += 1) {
    const reason = await probeAppConnectivity({ bootstrap: true });
    if (reason) return reason;
    if (i < attempts - 1) {
      await sleep(500);
    }
  }
  return null;
}
