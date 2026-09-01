import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { PALM_GUEST_CLAIM_TTL_SEC } from "@/lib/palm-constants";
import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";

/** HttpOnly capability for pending guest palm claim (not Tarot receipt, not Aura). */
export const PALM_GUEST_CLAIM_COOKIE = "zovus_palm_guest_claim";

export function setPalmGuestClaimCookieOnResponse(
  response: NextResponse,
  rawToken: string,
  request?: CookieRequestContext
): void {
  response.cookies.set(PALM_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: PALM_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export async function readPalmGuestClaimCookie(
  request?: NextRequest
): Promise<string | null> {
  const fromReq = request?.cookies.get(PALM_GUEST_CLAIM_COOKIE)?.value;
  if (fromReq) return fromReq;
  const jar = await cookies();
  return jar.get(PALM_GUEST_CLAIM_COOKIE)?.value ?? null;
}

export function clearPalmGuestClaimCookieOnResponse(
  response: NextResponse,
  request?: CookieRequestContext
): void {
  response.cookies.set(PALM_GUEST_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
