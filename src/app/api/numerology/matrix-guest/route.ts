import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
import {
  clientIp,
  enforceMatrixGuestCalcRateLimit,
} from "@/lib/api-guards";
import { setMatrixGuestClaimCookieOnResponse } from "@/lib/matrix-guest-claim-cookie";
import { createGuestMatrixPending } from "@/lib/services/matrix-guest-service";

export const runtime = "nodejs";

/**
 * Pre-auth Matrix: persist pending identity + issue HttpOnly claim cookie.
 * Free — no rune spend, no paid report entitlement.
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

  const limited = await enforceMatrixGuestCalcRateLimit(clientIp(request));
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const birthDate = typeof body.birthDate === "string" ? body.birthDate : "";
  const displayName = typeof body.displayName === "string" ? body.displayName : null;

  try {
    const { rawClaimToken, payload } = await createGuestMatrixPending({
      birthDate,
      displayName,
    });

    const response = NextResponse.json({
      ok: true,
      pending: payload,
    });
    setMatrixGuestClaimCookieOnResponse(response, rawClaimToken, request);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "INVALID_BIRTH_DATE") {
      return NextResponse.json({ error: "invalid_birth_date" }, { status: 400 });
    }
    console.warn("[matrix-guest] persist failed");
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }
}
