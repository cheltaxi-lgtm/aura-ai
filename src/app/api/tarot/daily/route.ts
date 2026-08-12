import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { getUserById } from "@/lib/users";
import { saveAuthenticatedDailyTriplet } from "@/lib/daily-triplet-save";

export const runtime = "nodejs";

/**
 * Authenticated daily 3-card Tarot save.
 * Does NOT require birthDate/zodiac — Tarot daily is birth-independent.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "needs_profile", code: "NEEDS_PROFILE" }, { status: 400 });
  }

  const user = await getUserById(profileUserId);
  if (!user) {
    return NextResponse.json({ error: "needs_profile", code: "NEEDS_PROFILE" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const result = await saveAuthenticatedDailyTriplet({
    userId: profileUserId,
    cards: body.cards ?? body.tarotCards,
    masterId: typeof body.masterId === "string" ? body.masterId : null,
    deckSystem: typeof body.deckSystem === "string" ? body.deckSystem : null,
    teaser: typeof body.teaser === "string" ? body.teaser : null,
    sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
  });

  if (!result.ok) {
    if (result.code === "COOLDOWN") {
      return NextResponse.json(
        {
          error: "TRIPLET_COOLDOWN",
          code: "TRIPLET_COOLDOWN",
          nextAvailableAt: result.nextAvailableAt ?? null,
          message: result.message,
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    daily: result.daily,
    nextAvailableAt: result.nextAvailableAt,
    reused: Boolean(result.reused),
    // No birth profile fields — intentional.
  });
}
