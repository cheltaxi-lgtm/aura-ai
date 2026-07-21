import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { resolveCookieSecure, type CookieRequestContext } from "@/lib/auth";
import { GUEST_RESUME_TTL_SEC } from "@/lib/guest-triplet-receipt-shared";

export const GUEST_RESUME_COOKIE = "zovus_guest_resume";

export async function setGuestResumeCookie(
  token: string,
  request?: CookieRequestContext
): Promise<void> {
  const jar = await cookies();
  jar.set(GUEST_RESUME_COOKIE, token, {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    maxAge: GUEST_RESUME_TTL_SEC,
    path: "/",
  });
}

export async function readGuestResumeCookie(
  request?: NextRequest
): Promise<string | null> {
  const fromReq = request?.cookies.get(GUEST_RESUME_COOKIE)?.value;
  if (fromReq) return fromReq;
  const jar = await cookies();
  return jar.get(GUEST_RESUME_COOKIE)?.value ?? null;
}

export async function clearGuestResumeCookie(
  request?: CookieRequestContext
): Promise<void> {
  const jar = await cookies();
  jar.set(GUEST_RESUME_COOKIE, "", {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  try {
    jar.delete(GUEST_RESUME_COOKIE);
  } catch {
    /* ignore */
  }
}
