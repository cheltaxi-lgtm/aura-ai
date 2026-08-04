/**
 * Middleware-side Human Design kill-switch. Middleware cannot reach the DB,
 * so it polls the public /api/platform/features endpoint with a short cache —
 * same pattern as maintenance-mode.
 */

let cached: { enabled: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 15_000;

function resolveFeaturesUrl(): string {
  const port = process.env.PORT || "3000";
  const host = process.env.INTERNAL_APP_HOST || "127.0.0.1";
  return `http://${host}:${port}/api/platform/features`;
}

export async function fetchHumanDesignEnabled(featuresUrl?: string): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.enabled;
  }
  try {
    const response = await fetch(featuresUrl || resolveFeaturesUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await response.json().catch(() => null)) as {
      humanDesignEnabled?: boolean;
    } | null;
    // Fail-open only when the endpoint is unreachable; an explicit false wins.
    const enabled = data ? data.humanDesignEnabled !== false : true;
    cached = { enabled, expiresAt: now + CACHE_TTL_MS };
    return enabled;
  } catch {
    cached = { enabled: true, expiresAt: now + CACHE_TTL_MS };
    return true;
  }
}
