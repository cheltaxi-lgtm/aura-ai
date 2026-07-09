import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { getRuneBalance } from "@/lib/rune-service";
import {
  ritualGenerationResponse,
  runRitualGenerationForUser,
} from "@/lib/ritual-generation-runner";
import { checkRitualAchievements } from "@/lib/achievements";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/** Build ritual text (await LLM). Safe to retry — no extra charge. */
export async function POST(_request: NextRequest, context: RouteContext) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const outcome = await runRitualGenerationForUser({
    ritualId: id,
    userId: authed.profileUserId,
    rollbackOnFailure: true,
  });

  const balance = await getRuneBalance(authed.profileUserId);

  let achievement = null;
  if (outcome.ok && outcome.freshlyCompleted) {
    try {
      achievement = await checkRitualAchievements(
        authed.profileUserId,
        outcome.ritual.character_key
      );
    } catch (err) {
      console.warn("Ritual achievement check failed:", err);
    }
  }

  const body = ritualGenerationResponse(outcome, achievement);

  if (outcome.ok) {
    return NextResponse.json({ ...body, balance });
  }

  if (outcome.error === "not_found") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (outcome.error === "invalid_status") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (outcome.error === "needs_payment") {
    return NextResponse.json({ ...body, balance });
  }

  return NextResponse.json({ ...body, balance }, { status: 502 });
}
