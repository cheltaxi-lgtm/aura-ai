/** Edge-safe user JWT revoke gate for middleware (no DB imports). */

const CACHE_TTL_MS = 5_000;

type CacheEntry = { ok: boolean; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** Loopback origin for middleware self-fetch (same pattern as maintenance-mode). */
export function resolveTokenVersionStatusUrl(): string {
  const port = process.env.PORT || "3000";
  const host = process.env.INTERNAL_APP_HOST || "127.0.0.1";
  return `http://${host}:${port}/api/auth/token-version`;
}

function cacheKey(sub: string, tv: number): string {
  return `${sub}:${tv}`;
}

/**
 * Confirm user JWT token_version still matches DB.
 * Call only when role === "user". Cached ~5s per (sub, tv).
 */
export async function fetchUserTokenVersionOk(
  request: { cookies: { get(name: string): { value: string } | undefined }; headers: { get(name: string): string | null } },
  sub: string,
  claimedTv: number,
  statusUrl?: string
): Promise<boolean> {
  const now = Date.now();
  const key = cacheKey(sub, claimedTv);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.ok;

  const cookie = request.cookies.get("aura_auth")?.value;
  if (!cookie) {
    cache.set(key, { ok: false, expiresAt: now + CACHE_TTL_MS });
    return false;
  }

  const url = statusUrl || resolveTokenVersionStatusUrl();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        cookie: `aura_auth=${cookie}`,
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
      signal: AbortSignal.timeout(4_000),
    });
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      sub?: string;
      tv?: number;
    } | null;
    const ok =
      response.ok &&
      data?.ok === true &&
      data.sub === sub &&
      (data.tv ?? 0) === claimedTv;
    cache.set(key, { ok, expiresAt: now + CACHE_TTL_MS });
    return ok;
  } catch {
    // Fail open on infra blip — handlers still enforce getAuth() + tv.
    cache.set(key, { ok: true, expiresAt: now + Math.min(CACHE_TTL_MS, 2_000) });
    return true;
  }
}

/** Drop cached entries after password reset / forced logout. */
export function invalidateTokenVersionCache(accountId?: string): void {
  if (!accountId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${accountId}:`)) cache.delete(key);
  }
}
