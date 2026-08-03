import { NextResponse } from "next/server";
import { getAuth, type AuthPayload } from "./auth";
import { getProfileUserIdForAccount } from "./accounts";

export async function requireUserAuth(): Promise<AuthPayload | null> {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") return null;
  return auth;
}

/** Resolves onboarding profile id (users.id) for a logged-in account. */
export async function requireProfileUserId(): Promise<{
  auth: AuthPayload;
  profileUserId: string;
} | null> {
  const auth = await requireUserAuth();
  if (!auth) return null;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) return null;

  return { auth, profileUserId };
}

/**
 * Same as requireProfileUserId, but keeps "not logged in" vs "needs birth profile"
 * distinct so clients do not send authenticated users to a login wall.
 */
export async function resolveProfileUserContext(): Promise<
  | { ok: true; auth: AuthPayload; profileUserId: string }
  | { ok: false; reason: "auth_required" | "needs_profile" }
> {
  const auth = await requireUserAuth();
  if (!auth) return { ok: false, reason: "auth_required" };

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) return { ok: false, reason: "needs_profile" };

  return { ok: true, auth, profileUserId };
}

export function authRequiredResponse() {
  return NextResponse.json(
    {
      error: "Unauthorized",
      code: "AUTH_REQUIRED",
    },
    { status: 401 }
  );
}

export function needsProfileResponse() {
  return NextResponse.json(
    {
      error: "Завершите профиль: укажите дату и город рождения.",
      code: "NEEDS_PROFILE",
    },
    { status: 401 }
  );
}

export function profileAuthFailureResponse(reason: "auth_required" | "needs_profile") {
  return reason === "needs_profile" ? needsProfileResponse() : authRequiredResponse();
}
