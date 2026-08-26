import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";

export const SESSION_CLAIM_COOKIE = "aura_session_claim";

const SESSION_CLAIM_MAX_AGE = 60 * 60 * 24 * 365;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "dev-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionClaim(sessionId: string): Promise<string> {
  return new SignJWT({ sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_CLAIM_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionClaim(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sessionId === "string" ? payload.sessionId : null;
  } catch {
    return null;
  }
}

function isOutsideNextRequestScope(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/cookies[\s`']*was called outside a request scope/i.test(error.message) ||
      /NEXT_DYNAMIC_API_WRONG_CONTEXT/i.test(error.message))
  );
}

export async function setSessionClaimCookie(
  sessionId: string,
  request?: CookieRequestContext
): Promise<void> {
  const token = await signSessionClaim(sessionId);
  try {
    const jar = await cookies();
    jar.set(SESSION_CLAIM_COOKIE, token, {
      httpOnly: true,
      secure: resolveCookieSecure(request),
      sameSite: "lax",
      maxAge: SESSION_CLAIM_MAX_AGE,
      path: "/",
    });
  } catch (error) {
    // In-process async-job runners call route handlers without Next request ALS.
    // Session rows are still created; cookie binding is a browser concern only.
    if (isOutsideNextRequestScope(error)) return;
    throw error;
  }
}

export async function readSessionClaimCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar.get(SESSION_CLAIM_COOKIE)?.value ?? null;
  } catch (error) {
    if (isOutsideNextRequestScope(error)) return null;
    throw error;
  }
}

/** Clear guest session claim with matching cookie attributes (WebView-safe). */
export async function clearSessionClaimCookie(
  request?: CookieRequestContext
): Promise<void> {
  let jar: Awaited<ReturnType<typeof cookies>>;
  try {
    jar = await cookies();
  } catch (error) {
    if (isOutsideNextRequestScope(error)) return;
    throw error;
  }
  jar.set(SESSION_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  try {
    jar.delete(SESSION_CLAIM_COOKIE);
  } catch {
    /* ignore */
  }
}

export async function verifySessionClaimForId(
  sessionId: string,
  claimToken: string | null | undefined
): Promise<boolean> {
  if (!claimToken) return false;
  const claimedSessionId = await verifySessionClaim(claimToken);
  return claimedSessionId === sessionId;
}

export type SessionClaimBindingState = "ok" | "missing" | "mismatch";

/** ok = cookie binds this id; missing = absent/invalid; mismatch = other id. */
export async function classifySessionClaimBinding(
  sessionId: string,
  claimToken: string | null | undefined
): Promise<SessionClaimBindingState> {
  if (!claimToken) return "missing";
  const claimedSessionId = await verifySessionClaim(claimToken);
  if (!claimedSessionId) return "missing";
  return claimedSessionId === sessionId ? "ok" : "mismatch";
}

export type GuestClaimBinding = {
  state: SessionClaimBindingState;
  /** True when pending guest binding matches this receipt. */
  bindingOk: boolean;
  /**
   * Primary issued→claimed must reject unless pending guest binding matches
   * this receipt. Missing binding is a reject — Capacitor cookie-loss uses
   * safe recovery UI, not a weaker claim path.
   */
  rejectPrimaryClaim: boolean;
};

/**
 * Dual-cookie evaluation for guest claim.
 * Possession is the HttpOnly resume cookie. The second proof is the pending
 * guest binding cookie. Missing and mismatch both reject primary issued→claimed.
 */
export async function evaluateGuestClaimBinding(
  receiptId: string,
  claimToken: string | null | undefined
): Promise<GuestClaimBinding> {
  const state = await classifySessionClaimBinding(receiptId, claimToken);
  const bindingOk = state === "ok";
  return {
    state,
    bindingOk,
    rejectPrimaryClaim: !bindingOk,
  };
}
