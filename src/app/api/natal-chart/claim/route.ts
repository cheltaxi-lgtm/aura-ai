import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { enforceNatalGuestClaimRateLimit } from "@/lib/api-guards";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  clearNatalGuestClaimCookieOnResponse,
  readNatalGuestClaimCookie,
} from "@/lib/natal-guest-claim-cookie";
import { claimGuestNatalChart } from "@/lib/services/natal-guest-service";
import { isNatalChartEnabled } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * Post-auth claim of guest Natal artifact.
 * Uses resolveProfileUserContext (stub OK) — NOT birth-profile gate.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  if (!(await isNatalChartEnabled())) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  const ctx = await resolveProfileUserContext();
  if (!ctx.ok) {
    return profileAuthFailureResponse(ctx.reason);
  }

  const limited = await enforceNatalGuestClaimRateLimit(ctx.auth.sub);
  if (limited) return limited;

  let confirmReplace = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    confirmReplace = body?.confirmReplace === true;
  } catch {
    /* empty body ok */
  }

  const rawToken = await readNatalGuestClaimCookie(request);
  const result = await claimGuestNatalChart({
    profileUserId: ctx.profileUserId,
    rawClaimToken: rawToken,
    confirmReplace,
  });

  if (!result.ok) {
    if (result.code === "NATAL_PROFILE_CONFLICT") {
      return NextResponse.json(
        {
          error: "natal_profile_conflict",
          code: "NATAL_PROFILE_CONFLICT",
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
            "Не удалось автоматически сохранить рассчитанную карту. Постройте карту снова или откройте кабинет.",
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
    artifactId: result.artifactId,
    workspacePath: "/cabinet/astrology?natalClaimed=1",
  });
  clearNatalGuestClaimCookieOnResponse(response, request);
  return response;
}
