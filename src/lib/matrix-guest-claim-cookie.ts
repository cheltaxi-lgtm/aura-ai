import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";

/** HttpOnly capability for pending guest Matrix claim. */
export const MATRIX_GUEST_CLAIM_COOKIE = "zovus_matrix_guest_claim";

/** Registration-window TTL: 7 days. */
export const MATRIX_GUEST_CLAIM_TTL_SEC = 7 * 24 * 60 * 60;
export const MATRIX_GUEST_CLAIM_TTL_MS = MATRIX_GUEST_CLAIM_TTL_SEC * 1000;

export async function setMatrixGuestClaimCookie(
  rawToken: string,
  request?: CookieRequestContext
): Promise<void> {
  const jar = await cookies();
  jar.set(MATRIX_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: MATRIX_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export function setMatrixGuestClaimCookieOnResponse(
  response: NextResponse,
  rawToken: string,
  request?: CookieRequestContext
): void {
  response.cookies.set(MATRIX_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: MATRIX_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export async function readMatrixGuestClaimCookie(
  request?: NextRequest
): Promise<string | null> {
  const fromReq = request?.cookies.get(MATRIX_GUEST_CLAIM_COOKIE)?.value;
  if (fromReq) return fromReq;
  const jar = await cookies();
  return jar.get(MATRIX_GUEST_CLAIM_COOKIE)?.value ?? null;
}

export function clearMatrixGuestClaimCookieOnResponse(
  response: NextResponse,
  request?: CookieRequestContext
): void {
  response.cookies.set(MATRIX_GUEST_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
