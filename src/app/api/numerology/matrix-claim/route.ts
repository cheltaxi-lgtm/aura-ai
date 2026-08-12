import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { enforceMatrixGuestClaimRateLimit } from "@/lib/api-guards";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  clearMatrixGuestClaimCookieOnResponse,
  readMatrixGuestClaimCookie,
} from "@/lib/matrix-guest-claim-cookie";
import { claimGuestMatrixPending } from "@/lib/services/matrix-guest-service";

export const runtime = "nodejs";

const FULL_HREF = "/?numerolog=1&tool=destiny_matrix";

/**
 * Post-auth claim of guest Matrix pending identity.
 * Uses resolveProfileUserContext (stub OK) — NOT birth-profile gate.
 * Does not grant paid report / rune entitlement / billing bypass.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ctx = await resolveProfileUserContext();
  if (!ctx.ok) {
    return profileAuthFailureResponse(ctx.reason);
  }

  const limited = await enforceMatrixGuestClaimRateLimit(ctx.auth.sub);
  if (limited) return limited;

  let confirmReplace = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    confirmReplace = body?.confirmReplace === true;
  } catch {
    /* empty body ok */
  }

  const rawToken = await readMatrixGuestClaimCookie(request);
  const result = await claimGuestMatrixPending({
    profileUserId: ctx.profileUserId,
    rawClaimToken: rawToken,
    confirmReplace,
  });

  if (!result.ok) {
    if (result.code === "MATRIX_PROFILE_CONFLICT") {
      return NextResponse.json(
        {
          error: "matrix_profile_conflict",
          code: "MATRIX_PROFILE_CONFLICT",
          conflict: result.conflict,
        },
        { status: 409 }
      );
    }
    if (result.code === "NO_CLAIM_TOKEN") {
      return NextResponse.json(
        {
          error: "no_claim_token",
          code: "NO_CLAIM_TOKEN",
          message:
            "Не удалось сохранить рассчитанную Матрицу. Рассчитайте снова или откройте полный разбор из кабинета.",
        },
        { status: 400 }
      );
    }
    if (result.code === "EXPIRED") {
      return NextResponse.json({ error: "expired", code: "EXPIRED" }, { status: 410 });
    }
    if (result.code === "ALREADY_CLAIMED") {
      return NextResponse.json(
        { error: "already_claimed", code: "ALREADY_CLAIMED" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "claim_denied", code: result.code }, { status: 400 });
  }

  const workspacePath = `${FULL_HREF}&subjectId=${encodeURIComponent(result.subjectId)}`;
  const response = NextResponse.json({
    ok: true,
    status: result.status,
    pendingId: result.pendingId,
    subjectId: result.subjectId,
    birthDate: result.birthDate,
    workspacePath,
  });
  clearMatrixGuestClaimCookieOnResponse(response, request);
  return response;
}
