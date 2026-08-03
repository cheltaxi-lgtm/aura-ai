/** Edge-safe user JWT revoke gate for middleware (no DB imports). */

const CACHE_TTL_MS = 5_000;

export type TokenVersionStatus = "ok" | "revoked" | "unavailable";

type CacheEntry = { status: TokenVersionStatus; expiresAt: number };

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

function asTokenVersion(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Confirm user JWT token_version still matches DB.
 * Call only when role === "user". Cached ~5s per (sub, tv).
 *
 * - ok: session valid
 * - revoked: explicit mismatch / invalid token — safe to clear cookie
 * - unavailable: infra/DB blip — do NOT clear cookie (fail open)
 */
export async function fetchUserTokenVersionStatus(
  request: {
    cookies: { get(name: string): { value: string } | undefined };
    headers: { get(name: string): string | null };
  },
  sub: string,
  claimedTv: number,
  statusUrl?: string
): Promise<TokenVersionStatus> {
  const now = Date.now();
  const claimed = asTokenVersion(claimedTv);
  const key = cacheKey(sub, claimed);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.status;

  const cookie = request.cookies.get("aura_auth")?.value;
  if (!cookie) {
    cache.set(key, { status: "revoked", expiresAt: now + CACHE_TTL_MS });
    return "revoked";
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
      reason?: string;
      sub?: string;
      tv?: unknown;
      dbTv?: unknown;
    } | null;

    if (response.status === 503 || data?.reason === "unavailable") {
      cache.set(key, {
        status: "unavailable",
        expiresAt: now + Math.min(CACHE_TTL_MS, 2_000),
      });
      return "unavailable";
    }

    if (
      response.ok &&
      data?.ok === true &&
      data.sub === sub &&
      asTokenVersion(data.tv) === claimed
    ) {
      cache.set(key, { status: "ok", expiresAt: now + CACHE_TTL_MS });
      return "ok";
    }

    // Explicit revoke / invalid cookie — fail closed.
    if (
      data?.reason === "revoked" ||
      data?.reason === "invalid" ||
      data?.reason === "missing" ||
      response.status === 401
    ) {
      cache.set(key, { status: "revoked", expiresAt: now + CACHE_TTL_MS });
      return "revoked";
    }

    cache.set(key, {
      status: "unavailable",
      expiresAt: now + Math.min(CACHE_TTL_MS, 2_000),
    });
    return "unavailable";
  } catch {
    // Fail open on infra blip — handlers still enforce getAuth() + tv.
    cache.set(key, {
      status: "unavailable",
      expiresAt: now + Math.min(CACHE_TTL_MS, 2_000),
    });
    return "unavailable";
  }
}

/** @deprecated Prefer fetchUserTokenVersionStatus — boolean collapses unavailable→false. */
export async function fetchUserTokenVersionOk(
  request: {
    cookies: { get(name: string): { value: string } | undefined };
    headers: { get(name: string): string | null };
  },
  sub: string,
  claimedTv: number,
  statusUrl?: string
): Promise<boolean> {
  const status = await fetchUserTokenVersionStatus(
    request,
    sub,
    claimedTv,
    statusUrl
  );
  return status === "ok" || status === "unavailable";
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
