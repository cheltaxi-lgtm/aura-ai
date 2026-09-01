/**
 * Middleware-side product kill-switches. Middleware cannot reach the DB,
 * so it polls the public /api/platform/features endpoint with a short cache —
 * same pattern as maintenance-mode / former hd-feature-gate.
 */

export type PlatformFeatureFlags = {
  humanDesignEnabled: boolean;
  natalChartEnabled: boolean;
  jointReadingEnabled: boolean;
  ritualsEnabled: boolean;
  photoReadingEnabled: boolean;
  auraReadingEnabled: boolean;
  palmReadingEnabled: boolean;
};

const FAIL_OPEN: PlatformFeatureFlags = {
  humanDesignEnabled: true,
  natalChartEnabled: true,
  jointReadingEnabled: true,
  ritualsEnabled: true,
  photoReadingEnabled: true,
  // Aura is fail-closed: ENV kill-switch default off.
  auraReadingEnabled: false,
  palmReadingEnabled: false,
};

let cached: { flags: PlatformFeatureFlags; expiresAt: number } | null = null;
const CACHE_TTL_MS = 15_000;

function resolveFeaturesUrl(): string {
  const port = process.env.PORT || "3000";
  const host = process.env.INTERNAL_APP_HOST || "127.0.0.1";
  return `http://${host}:${port}/api/platform/features`;
}

function parseFlags(data: Record<string, unknown> | null): PlatformFeatureFlags {
  if (!data) return FAIL_OPEN;
  return {
    // Explicit false wins; missing/undefined keeps fail-open for that flag.
    humanDesignEnabled: data.humanDesignEnabled !== false,
    natalChartEnabled: data.natalChartEnabled !== false,
    jointReadingEnabled: data.jointReadingEnabled !== false,
    ritualsEnabled: data.ritualsEnabled !== false,
    photoReadingEnabled: data.photoReadingEnabled !== false,
    // Fail-closed: only explicit true enables aura surfaces.
    auraReadingEnabled: data.auraReadingEnabled === true,
    palmReadingEnabled: data.palmReadingEnabled === true,
  };
}

export async function fetchPlatformFeatureFlags(
  featuresUrl?: string
): Promise<PlatformFeatureFlags> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.flags;
  }
  try {
    const response = await fetch(featuresUrl || resolveFeaturesUrl(), {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const flags = parseFlags(data);
    cached = { flags, expiresAt: now + CACHE_TTL_MS };
    return flags;
  } catch {
    cached = { flags: FAIL_OPEN, expiresAt: now + CACHE_TTL_MS };
    return FAIL_OPEN;
  }
}

/** @deprecated Prefer fetchPlatformFeatureFlags — kept for narrow call sites. */
export async function fetchHumanDesignEnabled(featuresUrl?: string): Promise<boolean> {
  const flags = await fetchPlatformFeatureFlags(featuresUrl);
  return flags.humanDesignEnabled;
}
