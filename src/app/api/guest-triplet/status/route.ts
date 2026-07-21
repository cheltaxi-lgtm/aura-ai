import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  findLatestOwnedGuestResume,
} from "@/lib/guest-triplet-receipt-db";
import { parseGuestResumeCardsPayload } from "@/lib/guest-triplet-receipt-shared";
import { GUEST_TRIPLET_MASTER_ID } from "@/lib/landing-offer";

export const runtime = "nodejs";

/**
 * Auth-only: return the caller's latest claimed/consumed guest-resume session.
 * Used for refresh/retry after receipt cookies were cleared on claim.
 * Never returns raw receipt token.
 */
export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ ok: true, status: "none" as const });
  }

  const row = await findLatestOwnedGuestResume(profileUserId);
  if (!row) {
    return NextResponse.json({ ok: true, status: "none" as const });
  }

  const payload = parseGuestResumeCardsPayload(row.cards);
  if (!payload) {
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
