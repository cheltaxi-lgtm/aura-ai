import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  clearAuraGuestClaimCookieOnResponse,
  readAuraGuestClaimCookie,
} from "@/lib/aura-guest-claim-cookie";
import { claimGuestAuraSnapshot } from "@/lib/services/aura-guest-service";
import { toAuraTeaserSnapshot } from "@/lib/aura-constants";
import { isAuraReadingEnabled } from "@/lib/settings";

export const runtime = "nodejs";

/** Guest Aura claim: per account. */
async function enforceAuraGuestClaimRateLimit(
  accountId: string
): Promise<NextResponse | null> {
  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("aura_guest_claim", accountId),
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

/**
 * Post-auth claim of the guest aura snapshot.
 * Binds the EXACT stored snapshot — no re-shoot, no recompute.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const ctx = await resolveProfileUserContext();
  if (!ctx.ok) {
    return profileAuthFailureResponse(ctx.reason);
  }

  const limited = await enforceAuraGuestClaimRateLimit(ctx.auth.sub);
  if (limited) return limited;

  const rawToken = await readAuraGuestClaimCookie(request);
  const result = await claimGuestAuraSnapshot({
    profileUserId: ctx.profileUserId,
    rawClaimToken: rawToken,
  });

  if (!result.ok) {
    if (result.code === "NO_CLAIM_TOKEN") {
      return NextResponse.json(
        {
          error: "no_claim_token",
          code: "NO_CLAIM_TOKEN",
          message:
            "Снимок ауры не найден — сделайте фото снова, это займёт меньше минуты.",
        },
        { status: 400 }
      );
    }
    if (result.code === "EXPIRED") {
      return NextResponse.json(
        { error: "expired", code: "EXPIRED" },
        { status: 410 }
      );
    }
    if (result.code === "ALREADY_CLAIMED") {
      return NextResponse.json(
        { error: "already_claimed", code: "ALREADY_CLAIMED" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "claim_denied", code: result.code },
      { status: 400 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    status: result.status,
    snapshotId: result.snapshotId,
    // Pre-payment subset only — layers/chakras ship with the paid report.
    snapshot: toAuraTeaserSnapshot(result.snapshot),
    subjectId: result.subjectId,
    subjectKind: result.subjectKind,
    subjectName: result.subjectName,
  });
  clearAuraGuestClaimCookieOnResponse(response, request);
  return response;
}
