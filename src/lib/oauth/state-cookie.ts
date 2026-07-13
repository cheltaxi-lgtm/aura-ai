import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";
import type { OAuthPendingState } from "./types";

const COOKIE = "aura_oauth_state";
const MAX_AGE = 60 * 10; // 10 minutes

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

export async function setOAuthPendingState(
  state: OAuthPendingState & { nonce: string },
  request?: CookieRequestContext
) {
  const token = await new SignJWT({ ...state })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function readOAuthPendingState(): Promise<(OAuthPendingState & { nonce: string }) | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as OAuthPendingState & { nonce: string };
  } catch {
    return null;
  }
}

export async function clearOAuthPendingState() {
  const jar = await cookies();
  jar.delete(COOKIE);
}
