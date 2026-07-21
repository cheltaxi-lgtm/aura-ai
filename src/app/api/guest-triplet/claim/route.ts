import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { enforceGuestTripletClaimRateLimit } from "@/lib/api-guards";
import {
  clearGuestResumeCookie,
  readGuestResumeCookie,
} from "@/lib/guest-resume-cookie";
import { isGuestResumeToken } from "@/lib/guest-triplet-receipt";
import {
  claimGuestResumeSession,
  findGuestResumeByTokenHash,
} from "@/lib/guest-triplet-receipt-db";
import { hashGuestResumeToken } from "@/lib/guest-triplet-receipt";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  clearSessionClaimCookie,
  readSessionClaimCookie,
  verifySessionClaimForId,
} from "@/lib/session-claim";

export const runtime = "nodejs";

/**
 * Post-auth: atomically claim a server-issued guest receipt into the user's session.
 * Token from HttpOnly cookie only; binding via aura_session_claim.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await enforceGuestTripletClaimRateLimit(auth.sub);
  if (limited) return limited;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json(
      { error: "Завершите профиль: укажите дату и город рождения.", code: "NEEDS_PROFILE" },
      { status: 403 }
    );
  }

  const token = await readGuestResumeCookie(request);
  if (!token || !isGuestResumeToken(token)) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  const tokenHash = hashGuestResumeToken(token);
  const receipt = await findGuestResumeByTokenHash(tokenHash);
  if (!receipt) {
    await clearGuestResumeCookie(request);
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  const claimCookie = await readSessionClaimCookie();
  const bindingOk = await verifySessionClaimForId(receipt.id, claimCookie);

  try {
    const result = await claimGuestResumeSession({
      token,
      profileUserId,
      bindingOk,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "unavailable" }, { status: 404 });
    }

    await clearGuestResumeCookie(request);

    // Clear session-claim only when it bound this claimed receipt.
    if (bindingOk) {
      await clearSessionClaimCookie(request);
    }

    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      masterId: result.masterId,
      alreadyClaimed: result.alreadyClaimed,
      question: result.payload.question,
      system: result.payload.system,
      cards: result.payload.symbols,
    });
  } catch (err) {
    console.error("[guest-triplet/claim] failed", err instanceof Error ? err.message : "error");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
