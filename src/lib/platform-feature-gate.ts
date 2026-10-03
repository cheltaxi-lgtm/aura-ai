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

export type PlatformFeatureState = {
  available: boolean;
  flags: PlatformFeatureFlags;
};

let cached: { flags: PlatformFeatureFlags; expiresAt: number; url: string } | null = null;
let inFlight: { url: string; promise: Promise<PlatformFeatureState> } | null = null;
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

export async function fetchPlatformFeatureState(
  featuresUrl?: string
): Promise<PlatformFeatureState> {
  const url = featuresUrl || resolveFeaturesUrl();
  const now = Date.now();
  if (cached && cached.url === url && cached.expiresAt > now) {
    return { available: true, flags: cached.flags };
  }
  if (inFlight?.url === url) return inFlight.promise;
  const pending = (async (): Promise<PlatformFeatureState> => {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) throw new Error("feature_status_unavailable");
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || Array.isArray(data)
        || !Object.keys(FAIL_OPEN).every(key => typeof (data as Record<string, unknown>)[key] === "boolean")) {
        throw new Error("feature_status_invalid");
      }
      const flags = parseFlags(data as Record<string, unknown>);
      cached = { flags, url, expiresAt: Date.now() + CACHE_TTL_MS };
      return { available: true, flags };
    } catch {
      // A timeout is not an operator turning a product off. Do not cache it as
      // a disabled feature: middleware returns a retryable 503 instead of 404.
      return { available: false, flags: FAIL_OPEN };
    }
  })();
  inFlight = { url, promise: pending };
  try {
    return await pending;
  } finally {
    if (inFlight?.promise === pending) inFlight = null;
  }
}

export async function fetchPlatformFeatureFlags(featuresUrl?: string): Promise<PlatformFeatureFlags> {
  return (await fetchPlatformFeatureState(featuresUrl)).flags;
}

/** @deprecated Prefer fetchPlatformFeatureFlags — kept for narrow call sites. */
export async function fetchHumanDesignEnabled(featuresUrl?: string): Promise<boolean> {
  const flags = await fetchPlatformFeatureFlags(featuresUrl);
  return flags.humanDesignEnabled;
}
