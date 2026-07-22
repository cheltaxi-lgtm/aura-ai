import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { enforceGuestTripletStatusRateLimit } from "@/lib/api-guards";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  findLatestOwnedGuestResume,
  getGuestResumeSessionById,
} from "@/lib/guest-triplet-receipt-db";
import {
  parseGuestResumeCardsPayload,
  recoverGuestResumeCardsFromNames,
} from "@/lib/guest-triplet-receipt-shared";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";

export const runtime = "nodejs";

/**
 * Auth-only: return one claimed/consumed guest-resume session.
 * - ?sessionId=… → exact session (refresh/retry after cookies cleared)
 * - no sessionId → latest owned claimed/consumed (cookie-loss recovery)
 * Never returns raw receipt token.
 */
export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await enforceGuestTripletStatusRateLimit(auth.sub);
  if (limited) return limited;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ ok: true, status: "none" as const });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  const row = sessionId
    ? await getGuestResumeSessionById(sessionId)
    : await findLatestOwnedGuestResume(profileUserId);
  if (
    !row ||
    row.user_id !== profileUserId ||
    (row.guest_resume_status !== "claimed" &&
      row.guest_resume_status !== "reading_consumed")
  ) {
    return NextResponse.json({ ok: true, status: "none" as const });
  }

  const payload =
    parseGuestResumeCardsPayload(row.cards) ??
    recoverGuestResumeCardsFromNames(row.cards);
  if (!payload) {
    // Still surface a consumed reading so the client can finish resume.
    if (
      row.guest_resume_status === "reading_consumed" &&
      row.guest_resume_reading_id
    ) {
      return NextResponse.json({
        ok: true,
        status: row.guest_resume_status,
        sessionId: row.id,
        masterId: row.character_key || GUEST_TRIPLET_MASTER_ID,
        question: "",
        system: "tarot-veronika",
        cards: [],
        readingId: row.guest_resume_reading_id,
        alreadyClaimed: true,
      });
    }
    return NextResponse.json({ ok: true, status: "none" as const });
  }

  return NextResponse.json({
    ok: true,
    status: row.guest_resume_status,
    sessionId: row.id,
    masterId: row.character_key || GUEST_TRIPLET_MASTER_ID,
    question: payload.question,
    system: payload.system,
    cards: payload.symbols,
    readingId: row.guest_resume_reading_id,
    alreadyClaimed: true,
  });
}
