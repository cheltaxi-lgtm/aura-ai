import { NextRequest, NextResponse } from "next/server";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { ensureDb } from "@/lib/db";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { getRuneBalance } from "@/lib/rune-service";
import {
  ritualGenerationResponse,
  runRitualGenerationForUser,
} from "@/lib/ritual-generation-runner";
import { checkRitualAchievements } from "@/lib/achievements";
import { getUserById } from "@/lib/users";

export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/** Build ritual text (await LLM). Safe to retry — no extra charge. */
export async function POST(request: NextRequest, context: RouteContext) {
  await ensureDb();

  const workerUserId = getAsyncJobWorkerUserId(request);
  let authed: { auth: { sub: string }; profileUserId: string };
  if (workerUserId) {
    authed = { auth: { sub: workerUserId }, profileUserId: workerUserId };
  } else {
    const profileCtx = await resolveProfileUserContext();
    if (!profileCtx.ok) {
      return profileAuthFailureResponse(profileCtx.reason);
    }
    authed = {
      auth: profileCtx.auth,
      profileUserId: profileCtx.profileUserId,
    };
  }

  const profileRow = await getUserById(authed.profileUserId);
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  if (!workerUserId) {
    const rateLimited = await enforcePaidRouteRateLimit(
      authed.auth.sub,
      "ritual_regenerate"
    );
    if (rateLimited) return rateLimited;
  }

  const { id } = await context.params;
  const rawBody = await request.json().catch(() => ({}));
  const asyncRequested =
    rawBody && typeof rawBody === "object" && (rawBody as { async?: unknown }).async === true;

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    return enqueuePaidAsyncJob({
      userId: authed.profileUserId,
      kind: "ritual_generation",
      payload: { id, async: false },
      bypassDeliveryGate: true,
    });
  }

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
    const payload = { ...body, balance };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  if (outcome.error === "not_found") {
    await trackWorkerJobFailed(request, "Ritual not found", { errorCode: "not_found" });
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (outcome.error === "invalid_status") {
    await trackWorkerJobFailed(request, "Ritual invalid status", {
      errorCode: "invalid_status",
    });
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (outcome.error === "needs_payment") {
    await trackWorkerJobFailed(request, "Ritual needs payment", {
      errorCode: "needs_payment",
    });
    return NextResponse.json({ ...body, balance });
  }

  await trackWorkerJobFailed(request, "Ritual generation failed", {
    refunded: true,
    errorCode: "generation_failed",
  });
  return NextResponse.json({ ...body, balance }, { status: 502 });
}
