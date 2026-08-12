import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
import {
  clientIp,
  enforceMatrixPairGuestCalcRateLimit,
} from "@/lib/api-guards";
import { setMatrixPairGuestClaimCookieOnResponse } from "@/lib/matrix-pair-guest-claim-cookie";
import { createGuestMatrixPairPending } from "@/lib/services/matrix-pair-guest-service";

export const runtime = "nodejs";

/**
 * Pre-auth Matrix pair compatibility: persist pending + HttpOnly claim cookie.
 * Free — no rune spend, no paid MATRIX_PAIR_REPORT entitlement.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isAgeGateCookieConfirmed(request))) {
    return NextResponse.json(
      { error: AGE_REQUIRED_ERROR.error, code: AGE_REQUIRED_ERROR.code },
      { status: 403 }
    );
  }

  const limited = await enforceMatrixPairGuestCalcRateLimit(clientIp(request));
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const dateA = typeof body.dateA === "string" ? body.dateA : "";
  const dateB = typeof body.dateB === "string" ? body.dateB : "";
  const nameA = typeof body.nameA === "string" ? body.nameA : null;
  const nameB = typeof body.nameB === "string" ? body.nameB : null;

  try {
    const { rawClaimToken, payload } = await createGuestMatrixPairPending({
      dateA,
      dateB,
      nameA,
      nameB,
    });

    const response = NextResponse.json({
      ok: true,
      pending: payload,
    });
    setMatrixPairGuestClaimCookieOnResponse(response, rawClaimToken, request);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "INVALID_BIRTH_DATE") {
      return NextResponse.json({ error: "invalid_birth_date" }, { status: 400 });
    }
    console.warn("[matrix-pair-guest] persist failed");
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
}
