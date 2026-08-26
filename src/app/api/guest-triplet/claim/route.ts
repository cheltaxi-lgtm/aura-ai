import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { enforceGuestTripletClaimRateLimit } from "@/lib/api-guards";
import {
  clearGuestBindingCookie,
  clearGuestResumeCookie,
  readGuestBindingCookie,
  readGuestResumeCookie,
} from "@/lib/guest-resume-cookie";
import { isGuestResumeToken } from "@/lib/guest-triplet-receipt";
import {
  claimGuestResumeSession,
  findGuestResumeByTokenHash,
} from "@/lib/guest-triplet-receipt-db";
import { hashGuestResumeToken } from "@/lib/guest-triplet-receipt";
import { requireUserAuth } from "@/lib/require-auth";
import { findUserById, getProfileUserIdForAccount } from "@/lib/accounts";
import { ensureMinimalConsumerProfile } from "@/lib/users";
import {
  clearSessionClaimCookie,
  evaluateGuestClaimBinding,
  readSessionClaimCookie,
  verifySessionClaimForId,
} from "@/lib/session-claim";

export const runtime = "nodejs";

/**
 * Post-auth: atomically claim a server-issued guest receipt into the user's session.
 * zovus_guest_resume is possession. aura_guest_claim is required second proof for
 * primary issued→claimed (missing and mismatch both reject). Chat aura_session_claim
 * may differ. Capacitor cookie-loss uses safe recovery UI — no token fallback.
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

  let profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    // Legacy accounts without a profile row: create a stub so Tarot claim works.
    // Birth is NOT required for guest full reading.
    const account = await findUserById(auth.sub);
    const stub = await ensureMinimalConsumerProfile({
      accountId: auth.sub,
      name: account?.name || auth.name || "Гость",
    });
    profileUserId = stub.id;
  }

  const token = await readGuestResumeCookie(request);
  if (!token || !isGuestResumeToken(token)) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  const tokenHash = hashGuestResumeToken(token);
  const receipt = await findGuestResumeByTokenHash(tokenHash);
  if (!receipt) {
    await clearGuestResumeCookie(request);
    await clearGuestBindingCookie(request);
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  const guestBindingCookie = await readGuestBindingCookie(request);
  const binding = await evaluateGuestClaimBinding(receipt.id, guestBindingCookie);
  const bindingOk = binding.bindingOk;

  try {
    const result = await claimGuestResumeSession({
      token,
      profileUserId,
      bindingOk,
      binding,
    });

    if (!result.ok) {
      if (result.code === "already_used") {
        // Burn the fresh guest receipt cookies — this account already used the free landing reading.
        await clearGuestResumeCookie(request);
        await clearGuestBindingCookie(request);
        return NextResponse.json(
          {
            error: "already_used",
            code: "already_used",
            message:
              "Бесплатный расклад с лендинга уже использован для этого аккаунта.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "unavailable" }, { status: 404 });
    }

    await clearGuestResumeCookie(request);
    await clearGuestBindingCookie(request);

    // Chat session claim may already bind a different session — only clear if
    // it still points at this guest receipt.
    const sessionClaim = await readSessionClaimCookie();
    if (sessionClaim && (await verifySessionClaimForId(receipt.id, sessionClaim))) {
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
