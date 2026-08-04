import { NextRequest, NextResponse } from "next/server";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { isHumanDesignEnabled } from "@/lib/settings";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { claimHdChart } from "@/lib/services/human-design-service";

/** Attach a guest-computed chart to the logged-in account (post-registration claim). */
export async function POST(request: NextRequest) {
  if (!(await isHumanDesignEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  const rateLimited = await enforcePaidRouteRateLimit(resolved.profileUserId, "hd_claim");
  if (rateLimited) return rateLimited;

  const body = (await request.json().catch(() => ({}))) as { fingerprint?: unknown };
  if (typeof body.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(body.fingerprint)) {
    return NextResponse.json({ error: "Некорректный идентификатор карты." }, { status: 400 });
  }

  const claimed = await claimHdChart(body.fingerprint, resolved.profileUserId);
  return NextResponse.json({ ok: true, claimed });
}
