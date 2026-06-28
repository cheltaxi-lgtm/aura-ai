import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export const AGE_GATE_COOKIE = "aura_age_gate";

const AGE_GATE_MAX_AGE = 60 * 60 * 24 * 365;

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

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return appUrl.startsWith("https://");
}

async function signAgeGateToken(): Promise<string> {
  return new SignJWT({ ageConfirmed: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${AGE_GATE_MAX_AGE}s`)
    .sign(secretKey());
}

async function verifyAgeGateToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.ageConfirmed === true;
  } catch {
    return false;
  }
}

export async function setAgeGateCookie(): Promise<void> {
  const token = await signAgeGateToken();
  const jar = await cookies();
  jar.set(AGE_GATE_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    maxAge: AGE_GATE_MAX_AGE,
    path: "/",
  });
}

export async function isAgeGateCookieConfirmed(request?: NextRequest): Promise<boolean> {
  const token =
    request?.cookies.get(AGE_GATE_COOKIE)?.value ??
    (await cookies()).get(AGE_GATE_COOKIE)?.value;
  if (!token) return false;
  return verifyAgeGateToken(token);
}
