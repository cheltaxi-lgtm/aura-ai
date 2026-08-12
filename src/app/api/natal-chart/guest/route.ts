import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
import {
  clientIp,
  enforceNatalGuestCalcRateLimit,
} from "@/lib/api-guards";
import { isNatalChartEnabled } from "@/lib/settings";
import { setNatalGuestClaimCookieOnResponse } from "@/lib/natal-guest-claim-cookie";
import { createGuestNatalChart } from "@/lib/services/natal-guest-service";
import type { NatalPlace } from "@/lib/natal";

export const runtime = "nodejs";

/**
 * Pre-auth Natal: compute + persist guest artifact, issue HttpOnly claim cookie.
 * Does not mutate users / natal_charts ownership. Free — no rune spend.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  if (!(await isAgeGateCookieConfirmed(request))) {
    return NextResponse.json(
      { error: AGE_REQUIRED_ERROR.error, code: AGE_REQUIRED_ERROR.code },
      { status: 403 }
    );
  }

  const limited = await enforceNatalGuestCalcRateLimit(clientIp(request));
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const birthDate = typeof body.birthDate === "string" ? body.birthDate : "";
  const timeKnown = body.timeKnown === true;
  const birthTime =
    typeof body.birthTime === "string" ? body.birthTime : null;
  const placeRaw = body.place;
  if (!placeRaw || typeof placeRaw !== "object" || Array.isArray(placeRaw)) {
    return NextResponse.json({ error: "invalid_place" }, { status: 400 });
  }
  const p = placeRaw as Record<string, unknown>;
  const place: NatalPlace = {
    label: typeof p.label === "string" ? p.label : "",
    latitude: typeof p.latitude === "number" ? p.latitude : Number.NaN,
    longitude: typeof p.longitude === "number" ? p.longitude : Number.NaN,
    timezone: typeof p.timezone === "string" ? p.timezone : "",
  };

  try {
    const { rawClaimToken, payload } = await createGuestNatalChart({
      birthDate,
      birthTime,
      timeKnown,
      place,
    });

    const response = NextResponse.json({
      ok: true,
      chart: payload,
    });
    setNatalGuestClaimCookieOnResponse(response, rawClaimToken, request);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error";
    if (msg === "INVALID_BIRTH_DATE") {
      return NextResponse.json({ error: "invalid_birth_date" }, { status: 400 });
    }
    if (msg === "INVALID_BIRTH_TIME") {
      return NextResponse.json({ error: "invalid_birth_time" }, { status: 400 });
    }
    if (msg === "INVALID_PLACE") {
      return NextResponse.json({ error: "invalid_place" }, { status: 400 });
    }
    if (msg === "NATAL_DISABLED") {
      return NextResponse.json({ error: "disabled" }, { status: 404 });
    }
    console.warn("[natal-guest] calc failed");
    return NextResponse.json({ error: "calc_failed" }, { status: 500 });
  }
}
