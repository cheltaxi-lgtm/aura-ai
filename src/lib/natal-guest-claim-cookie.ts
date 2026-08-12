import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";

/** HttpOnly capability for pending guest Natal claim (not Tarot receipt). */
export const NATAL_GUEST_CLAIM_COOKIE = "zovus_natal_guest_claim";

/** Registration-window TTL: 7 days (matches cookie maxAge + artifact expires_at). */
export const NATAL_GUEST_CLAIM_TTL_SEC = 7 * 24 * 60 * 60;
export const NATAL_GUEST_CLAIM_TTL_MS = NATAL_GUEST_CLAIM_TTL_SEC * 1000;

export async function setNatalGuestClaimCookie(
  rawToken: string,
  request?: CookieRequestContext
): Promise<void> {
  const jar = await cookies();
  jar.set(NATAL_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: NATAL_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export function setNatalGuestClaimCookieOnResponse(
  response: NextResponse,
  rawToken: string,
  request?: CookieRequestContext
): void {
  response.cookies.set(NATAL_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: NATAL_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export async function readNatalGuestClaimCookie(
  request?: NextRequest
): Promise<string | null> {
  const fromReq = request?.cookies.get(NATAL_GUEST_CLAIM_COOKIE)?.value;
  if (fromReq) return fromReq;
  const jar = await cookies();
  return jar.get(NATAL_GUEST_CLAIM_COOKIE)?.value ?? null;
}

export async function clearNatalGuestClaimCookie(
  request?: CookieRequestContext
): Promise<void> {
  const jar = await cookies();
  jar.set(NATAL_GUEST_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  try {
    jar.delete(NATAL_GUEST_CLAIM_COOKIE);
  } catch {
    /* ignore */
  }
}

export function clearNatalGuestClaimCookieOnResponse(
  response: NextResponse,
  request?: CookieRequestContext
): void {
  response.cookies.set(NATAL_GUEST_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
