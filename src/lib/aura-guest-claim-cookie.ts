import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { AURA_GUEST_CLAIM_TTL_SEC } from "@/lib/aura-constants";
import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";

/** HttpOnly capability for pending guest Aura claim (not Tarot receipt, not Natal). */
export const AURA_GUEST_CLAIM_COOKIE = "zovus_aura_guest_claim";

export function setAuraGuestClaimCookieOnResponse(
  response: NextResponse,
  rawToken: string,
  request?: CookieRequestContext
): void {
  response.cookies.set(AURA_GUEST_CLAIM_COOKIE, rawToken, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: AURA_GUEST_CLAIM_TTL_SEC,
    path: "/",
  });
}

export async function readAuraGuestClaimCookie(
  request?: NextRequest
): Promise<string | null> {
  const fromReq = request?.cookies.get(AURA_GUEST_CLAIM_COOKIE)?.value;
  if (fromReq) return fromReq;
  const jar = await cookies();
  return jar.get(AURA_GUEST_CLAIM_COOKIE)?.value ?? null;
}

export function clearAuraGuestClaimCookieOnResponse(
  response: NextResponse,
  request?: CookieRequestContext
): void {
  response.cookies.set(AURA_GUEST_CLAIM_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
