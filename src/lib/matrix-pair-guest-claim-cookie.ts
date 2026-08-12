import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";

/** HttpOnly capability for pending guest Matrix pair claim. */
export const MATRIX_PAIR_GUEST_CLAIM_COOKIE = "zovus_matrix_pair_guest_claim";

/** Registration-window TTL: 7 days. */
export const MATRIX_PAIR_GUEST_CLAIM_TTL_SEC = 7 * 24 * 60 * 60;
export const MATRIX_PAIR_GUEST_CLAIM_TTL_MS = MATRIX_PAIR_GUEST_CLAIM_TTL_SEC * 1000;

export function setMatrixPairGuestClaimCookieOnResponse(
  response: NextResponse,
  rawToken: string,
  request?: CookieRequestContext
): void {
  response.cookies.set(MATRIX_PAIR_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: MATRIX_PAIR_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export async function readMatrixPairGuestClaimCookie(
  request?: NextRequest
): Promise<string | null> {
  const fromReq = request?.cookies.get(MATRIX_PAIR_GUEST_CLAIM_COOKIE)?.value;
  if (fromReq) return fromReq;
  const jar = await cookies();
  return jar.get(MATRIX_PAIR_GUEST_CLAIM_COOKIE)?.value ?? null;
}

export function clearMatrixPairGuestClaimCookieOnResponse(
  response: NextResponse,
  request?: CookieRequestContext
): void {
  response.cookies.set(MATRIX_PAIR_GUEST_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
