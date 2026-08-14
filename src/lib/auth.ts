import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export type AuthRole = "user" | "expert" | "admin";

export interface AuthPayload {
  sub: string;
  role: AuthRole;
  email: string;
  name: string;
  slug?: string;
  /** Token version; must match user_accounts.token_version for role=user. */
  tv?: number;
}

export type CookieRequestContext = {
  headers: { get(name: string): string | null };
  nextUrl?: { protocol: string };
};

const COOKIE = "aura_auth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Secure cookies are dropped on plain HTTP — derive from the incoming request. */
export function resolveCookieSecure(request?: CookieRequestContext): boolean {
  // Production always Secure — never honor COOKIE_SECURE=false (session theft on HTTP).
  if (process.env.NODE_ENV === "production") {
    return true;
  }
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;

  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isHttps =
    forwardedProto === "https" || request?.nextUrl?.protocol === "https:";

  if (!isHttps) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.startsWith("https://");
}

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "dev-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function getAccountTokenVersion(accountId: string): Promise<number | null> {
  try {
    const { rows } = await query<{ token_version: number }>(
      `SELECT token_version FROM user_accounts WHERE id = $1 LIMIT 1`,
      [accountId]
    );
    if (!rows[0]) return null;
    return Number(rows[0].token_version) || 0;
  } catch (err) {
    // Migration 092 missing: fail closed in production so revoke cannot silently no-op.
    if (process.env.NODE_ENV === "production") {
      console.error("[auth] token_version unavailable — reject session", accountId, err);
      return null;
    }
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM user_accounts WHERE id = $1 LIMIT 1`,
      [accountId]
    );
    return rows[0] ? 0 : null;
  }
}

/** Invalidate all outstanding JWTs for this account (password reset, forced logout). */
export async function bumpAccountTokenVersion(accountId: string): Promise<void> {
  try {
    const { rowCount } = await query(
      `UPDATE user_accounts SET token_version = token_version + 1 WHERE id = $1`,
      [accountId]
    );
    if (!rowCount && process.env.NODE_ENV === "production") {
      throw new Error("bumpAccountTokenVersion: account not updated");
    }
    try {
      const { invalidateTokenVersionCache } = await import("@/lib/token-version-gate");
      invalidateTokenVersionCache(accountId);
    } catch {
      /* edge/cache optional */
    }
  } catch (err) {
    console.error("[auth] bumpAccountTokenVersion failed", accountId, err);
    if (process.env.NODE_ENV === "production") throw err;
  }
}

export async function signToken(payload: AuthPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as AuthPayload;
  } catch {
    return null;
  }
}

/**
 * Verify JWT + token_version for a raw cookie value.
 * Prefer getAuth() when reading the request cookie jar; use this when you
 * already hold the token string and must not skip revoke checks.
 */
export async function verifyTokenWithVersion(token: string): Promise<AuthPayload | null> {
  const payload = await verifyToken(token);
  if (!payload) return null;
  if (payload.role === "user") {
    const tv = await getAccountTokenVersion(payload.sub);
    if (tv === null) return null;
    if ((Number(payload.tv ?? 0) || 0) !== tv) return null;
  }
  return payload;
}

export function authCookieOptions(request?: CookieRequestContext) {
  return {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax" as const,
    maxAge: MAX_AGE,
    path: "/",
  };
}

async function withTokenVersion(payload: AuthPayload): Promise<AuthPayload | null> {
  if (payload.role !== "user") return payload;
  const tv = await getAccountTokenVersion(payload.sub);
  if (tv === null) return null;
  return { ...payload, tv };
}

export async function setAuthCookie(payload: AuthPayload, request?: CookieRequestContext) {
  const enriched = await withTokenVersion(payload);
  if (!enriched) return;
  const token = await signToken(enriched);
  const jar = await cookies();
  jar.set(COOKIE, token, authCookieOptions(request));
  if (enriched.role === "user") {
    const { touchAccountLastLogin } = await import("@/lib/accounts");
    await touchAccountLastLogin(enriched.sub);
  }
}

/** Attach aura_auth on a redirect/JSON response (needed for WebView document navigations). */
export async function applyAuthCookie(
  response: { cookies: { set: (name: string, value: string, options: ReturnType<typeof authCookieOptions>) => void } },
  payload: AuthPayload,
  request?: CookieRequestContext
) {
  const enriched = await withTokenVersion(payload);
  if (!enriched) return;
  const token = await signToken(enriched);
  response.cookies.set(COOKIE, token, authCookieOptions(request));
  if (enriched.role === "user") {
    const { touchAccountLastLogin } = await import("@/lib/accounts");
    await touchAccountLastLogin(enriched.sub);
  }
}

/**
 * Clear auth cookie with the same path/secure/sameSite attributes used on set.
 * Bare `cookies().delete(name)` often fails to remove Secure cookies in Android WebView.
 */
export async function clearAuthCookie(request?: CookieRequestContext) {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  try {
    jar.delete(COOKIE);
  } catch {
    /* set(maxAge:0) is enough for most browsers */
  }
}

export async function getAuth(): Promise<AuthPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  if (payload.role === "user") {
    const tv = await getAccountTokenVersion(payload.sub);
    if (tv === null) return null;
    if ((Number(payload.tv ?? 0) || 0) !== tv) return null;
  }

  return payload;
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "master";
}
