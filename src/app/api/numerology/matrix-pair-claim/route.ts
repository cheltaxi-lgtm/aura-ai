import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { enforceMatrixPairGuestClaimRateLimit } from "@/lib/api-guards";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  clearMatrixPairGuestClaimCookieOnResponse,
  readMatrixPairGuestClaimCookie,
} from "@/lib/matrix-pair-guest-claim-cookie";
import { claimGuestMatrixPairPending } from "@/lib/services/matrix-pair-guest-service";

export const runtime = "nodejs";

const FULL_HREF = "/?numerolog=1&tool=matrix_compatibility&resumePair=1";

/**
 * Post-auth claim of guest Matrix pair pending.
 * Stub profile OK. Does not grant paid MATRIX_PAIR_REPORT / runes.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const ctx = await resolveProfileUserContext();
  if (!ctx.ok) {
    return profileAuthFailureResponse(ctx.reason);
  }

  const limited = await enforceMatrixPairGuestClaimRateLimit(ctx.auth.sub);
  if (limited) return limited;

  let confirmReplace = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    confirmReplace = body?.confirmReplace === true;
  } catch {
    /* empty body ok */
  }

  const rawToken = await readMatrixPairGuestClaimCookie(request);
  const result = await claimGuestMatrixPairPending({
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
            "Не удалось сохранить расчёт совместимости. Рассчитайте пару снова или откройте полный разбор из кабинета.",
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

  const response = NextResponse.json({
    ok: true,
    status: result.status,
    pendingId: result.pendingId,
    dateA: result.dateA,
    dateB: result.dateB,
    nameA: result.nameA,
    nameB: result.nameB,
    score: result.score,
    calculationVersion: result.calculationVersion,
    preview: result.preview,
    workspacePath: FULL_HREF,
  });
  clearMatrixPairGuestClaimCookieOnResponse(response, request);
  return response;
}
