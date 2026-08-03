import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  findAdminById,
  requireAdmin,
  verifyAdminPassword,
} from "@/lib/admin-auth";
import {
  resolveCookieSecure,
  type AuthPayload,
  type CookieRequestContext,
} from "@/lib/auth";

const STEPUP_COOKIE = "aura_admin_stepup";
const STEPUP_MAX_AGE_SEC = 15 * 60;

type StepUpClaims = {
  sub: string;
  purpose: "admin_stepup";
};

function stepUpSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "dev-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode("dev-secret-change-in-production");
  }
  return new TextEncoder().encode(`stepup:${secret}`);
}

function stepUpCookieOptions(request?: CookieRequestContext) {
  return {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax" as const,
    maxAge: STEPUP_MAX_AGE_SEC,
    path: "/",
  };
}

async function readStepUpSub(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(STEPUP_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, stepUpSecret());
    const claims = payload as unknown as StepUpClaims;
    if (claims.purpose !== "admin_stepup" || !claims.sub) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

async function issueStepUpCookie(adminId: string, request?: CookieRequestContext) {
  const token = await new SignJWT({
    sub: adminId,
    purpose: "admin_stepup",
  } satisfies StepUpClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STEPUP_MAX_AGE_SEC}s`)
    .sign(stepUpSecret());
  const jar = await cookies();
  jar.set(STEPUP_COOKIE, token, stepUpCookieOptions(request));
}

function stepUpRequiredResponse() {
  return NextResponse.json(
    {
      error: "Требуется подтверждение пароля",
      code: "step_up_required",
    },
    { status: 401 }
  );
}

function stepUpInvalidResponse() {
  return NextResponse.json(
    {
      error: "Неверный пароль",
      code: "step_up_invalid",
    },
    { status: 401 }
  );
}

function extractConfirmPassword(request?: NextRequest): string {
  if (!request) return "";
  return (request.headers.get("x-admin-confirm-password") ?? "").trim();
}

/**
 * Admin session + fresh password (or valid 15m step-up cookie).
 * Client sends password via header `X-Admin-Confirm-Password` (see adminFetch).
 */
export async function requireAdminStepUp(
  request?: NextRequest
): Promise<{ ok: true; auth: AuthPayload } | { ok: false; response: NextResponse }> {
  const auth = await requireAdmin();
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const steppedSub = await readStepUpSub();
  if (steppedSub && steppedSub === auth.sub) {
    return { ok: true, auth };
  }

  const password = extractConfirmPassword(request);
  if (!password) {
    return { ok: false, response: stepUpRequiredResponse() };
  }

  const admin = await findAdminById(auth.sub);
  if (!admin || !admin.is_active) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const valid = await verifyAdminPassword(password, admin.password_hash);
  if (!valid) {
    return { ok: false, response: stepUpInvalidResponse() };
  }

  await issueStepUpCookie(auth.sub, request);
  return { ok: true, auth };
}
