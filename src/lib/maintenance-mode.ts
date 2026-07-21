/** Edge-safe maintenance gate for middleware (no DB imports). */

const CACHE_TTL_MS = 5_000;
let cachedMaintenance: { active: boolean; expiresAt: number } | null = null;

export const MAINTENANCE_PAGE_PATH = "/maintenance";

export const MAINTENANCE_BYPASS_PREFIXES = [
  // Whole admin UI — otherwise /admin redirects to /maintenance before login can complete.
  "/admin",
  "/api/platform/status",
  "/api/health",
  "/api/payment/webhook",
  "/api/payments/webhook",
  "/api/runes/webhook",
  "/api/auth/admin/",
] as const;

export const MAINTENANCE_BYPASS_API_PREFIXES = [
  "/api/cron/",
  "/api/admin/",
] as const;

export function isMaintenanceBypassPath(pathname: string): boolean {
  if (MAINTENANCE_BYPASS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (MAINTENANCE_BYPASS_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return true;
  }
  return false;
}

/** Loopback origin for middleware self-fetch (avoids hairpin HTTPS / edge fetch failures). */
export function resolveMaintenanceStatusUrl(): string {
  const port = process.env.PORT || "3000";
  const host = process.env.INTERNAL_APP_HOST || "127.0.0.1";
  return `http://${host}:${port}/api/platform/status`;
}

export async function fetchMaintenanceModeActive(statusUrl?: string): Promise<boolean> {
  const now = Date.now();
  if (cachedMaintenance && cachedMaintenance.expiresAt > now) {
    return cachedMaintenance.active;
  }

  const url = statusUrl || resolveMaintenanceStatusUrl();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await response.json().catch(() => null)) as { maintenanceMode?: boolean } | null;
    const active = data?.maintenanceMode === true;
    cachedMaintenance = { active, expiresAt: now + CACHE_TTL_MS };
    return active;
  } catch (error) {
    cachedMaintenance = { active: false, expiresAt: now + CACHE_TTL_MS };
    return false;
  }
}

/** Clear cache after admin toggles maintenance (optional server-side hook). */
export function invalidateMaintenanceModeCache(): void {
  cachedMaintenance = null;
}
