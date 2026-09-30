import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById } from "@/lib/users";
import { readSessionClaimCookie } from "@/lib/session-claim";
import { saveIntroTriplet } from "@/lib/intro-triplet";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const auth = await requireUserAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId || !(await getUserById(userId))) return NextResponse.json({ error: "needs_profile" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }
  const result = await saveIntroTriplet({
    userId,
    cards: body.cards,
    masterId: typeof body.masterId === "string" ? body.masterId : null,
    deckSystem: typeof body.deckSystem === "string" ? body.deckSystem : null,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
    claimToken: await readSessionClaimCookie(),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "ALREADY_USED" ? 409 : 400 });
}
