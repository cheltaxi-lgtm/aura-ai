import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

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

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.startsWith("https://");
}

export async function setSessionClaimCookie(sessionId: string): Promise<void> {
  const token = await signSessionClaim(sessionId);
  const jar = await cookies();
  jar.set(SESSION_CLAIM_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: SESSION_CLAIM_MAX_AGE,
    path: "/",
  });
}

export async function readSessionClaimCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_CLAIM_COOKIE)?.value ?? null;
}

export async function verifySessionClaimForId(
  sessionId: string,
  claimToken: string | null | undefined
): Promise<boolean> {
  if (!claimToken) return false;
  const claimedSessionId = await verifySessionClaim(claimToken);
  return claimedSessionId === sessionId;
}
