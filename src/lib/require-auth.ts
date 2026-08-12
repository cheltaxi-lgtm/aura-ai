import { NextResponse } from "next/server";
import { getAuth, type AuthPayload } from "./auth";
import { getProfileUserIdForAccount } from "./accounts";
import { getUserById, profileHasBirthData } from "./users";

export async function requireUserAuth(): Promise<AuthPayload | null> {
  const auth = await getAuth();
  if (!auth || auth.role !== "user") return null;
  return auth;
}

/** Resolves consumer profile id (users.id) for a logged-in account (stub ok). */
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
 * Birth-dependent features (natal / matrix / HD): require a real birth_date.
 * Stub consumer profiles (null birth) must not enter these calculators.
 */
export async function requireBirthProfileUserId(): Promise<{
  auth: AuthPayload;
  profileUserId: string;
} | null> {
  const ctx = await requireProfileUserId();
  if (!ctx) return null;
  const row = await getUserById(ctx.profileUserId);
  if (!profileHasBirthData(row)) return null;
  return ctx;
}

/**
 * Same as requireProfileUserId, but keeps "not logged in" vs "needs profile row"
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

export async function resolveBirthProfileUserContext(): Promise<
  | { ok: true; auth: AuthPayload; profileUserId: string }
  | { ok: false; reason: "auth_required" | "needs_profile" | "needs_birth_profile" }
> {
  const base = await resolveProfileUserContext();
  if (!base.ok) return base;
  const row = await getUserById(base.profileUserId);
  if (!profileHasBirthData(row)) {
    return { ok: false, reason: "needs_birth_profile" };
  }
  return base;
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

export function needsBirthProfileResponse() {
  return NextResponse.json(
    {
      error: "Для этого расчёта нужна дата рождения. Заполните профиль — это займёт минуту.",
      code: "NEEDS_BIRTH_PROFILE",
    },
    { status: 403 }
  );
}

export function profileAuthFailureResponse(
  reason: "auth_required" | "needs_profile" | "needs_birth_profile"
) {
  if (reason === "needs_birth_profile") return needsBirthProfileResponse();
  return reason === "needs_profile" ? needsProfileResponse() : authRequiredResponse();
}
