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

export async function setSessionClaimCookie(
  sessionId: string,
  request?: CookieRequestContext
): Promise<void> {
  // Do not overwrite a pending guest-resume binding. After OAuth, /api/session
  // mints a fresh session and used to clobber aura_session_claim — claim then
  // failed forever while the guest receipt stayed "issued".
  try {
    const existing = await readSessionClaimCookie();
    if (existing) {
      const existingSessionId = await verifySessionClaim(existing);
      if (existingSessionId && existingSessionId !== sessionId) {
        const { getGuestResumeSessionById } = await import(
          "@/lib/guest-triplet-receipt-db"
        );
        const guest = await getGuestResumeSessionById(existingSessionId);
        if (
          guest &&
          (guest.guest_resume_status === "issued" ||
            guest.guest_resume_status === "claimed") &&
          !guest.guest_resume_reading_id
        ) {
          return;
        }
      }
    }
  } catch {
    /* fall through and set the new claim */
  }

  const token = await signSessionClaim(sessionId);
  const jar = await cookies();
  jar.set(SESSION_CLAIM_COOKIE, token, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: SESSION_CLAIM_MAX_AGE,
    path: "/",
  });
}

export async function readSessionClaimCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_CLAIM_COOKIE)?.value ?? null;
}

/** Clear guest session claim with matching cookie attributes (WebView-safe). */
export async function clearSessionClaimCookie(
  request?: CookieRequestContext
): Promise<void> {
  const jar = await cookies();
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
