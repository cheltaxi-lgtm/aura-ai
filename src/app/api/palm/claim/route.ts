import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  clearPalmGuestClaimCookieOnResponse,
  readPalmGuestClaimCookie,
} from "@/lib/palm-guest-claim-cookie";
import { claimGuestPalmSnapshot } from "@/lib/services/palm-guest-service";
import { toPalmTeaserSnapshot } from "@/lib/palm-constants";
import { isPalmReadingEnabled } from "@/lib/settings";

export const runtime = "nodejs";

async function enforcePalmGuestClaimRateLimit(
  accountId: string
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("palm_guest_claim", accountId),
    20,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 3600) } }
    );
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isPalmReadingEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const ctx = await resolveProfileUserContext();
  if (!ctx.ok) {
    return profileAuthFailureResponse(ctx.reason);
  }

  const limited = await enforcePalmGuestClaimRateLimit(ctx.auth.sub);
  if (limited) return limited;

  const rawToken = await readPalmGuestClaimCookie(request);
  const result = await claimGuestPalmSnapshot({
    profileUserId: ctx.profileUserId,
    rawClaimToken: rawToken,
  });

  if (!result.ok) {
    if (result.code === "NO_CLAIM_TOKEN") {
      return NextResponse.json(
        {
          error: "no_claim_token",
          code: "NO_CLAIM_TOKEN",
          message: "Снимок ладони не найден — сделайте фото снова, это займёт меньше минуты.",
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
    snapshotId: result.snapshotId,
    snapshot: toPalmTeaserSnapshot(result.snapshot),
  });
  clearPalmGuestClaimCookieOnResponse(response, request);
  return response;
}
