import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  claimJointCompletionNotification,
  ensureCombinedReading,
  getJointReadingByToken,
  notifyJointReadingEvent,
} from "@/lib/joint-reading-service";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import { checkJointReadingAchievementsSilently } from "@/lib/achievements";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * Durable worker endpoint: synthesize joint combined AI reading.
 * Browser may also call with async:true to enqueue.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const { token } = await params;
  const workerUserId = getAsyncJobWorkerUserId(request);
  let profileUserId: string;
  if (workerUserId) {
    profileUserId = workerUserId;
  } else {
    const profileCtx = await resolveProfileUserContext();
    if (!profileCtx.ok) {
      return profileAuthFailureResponse(profileCtx.reason);
    }
    profileUserId = profileCtx.profileUserId;
  }

  const rawBody = await request.json().catch(() => ({}));
  const asyncRequested =
    rawBody && typeof rawBody === "object" && (rawBody as { async?: unknown }).async === true;

  const row = await getJointReadingByToken(token);
  if (!row || row.status === "expired") {
    return NextResponse.json({ error: "Invite expired or not found" }, { status: 404 });
  }

  const isParticipant =
    profileUserId === row.initiator_user_id || profileUserId === row.partner_user_id;
  if (!isParticipant && !workerUserId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    return enqueuePaidAsyncJob({
      userId: row.initiator_user_id,
      kind: "joint_combined",
      payload: { token, async: false },
      bypassDeliveryGate: true,
    });
  }

  if (!row.initiator_reading?.trim() || !row.partner_reading?.trim()) {
    return NextResponse.json(
      { error: "Both sides required", code: "sides_incomplete" },
      { status: 409 }
    );
  }

  if (row.combined_reading?.trim()) {
    const payload = {
      token: row.token,
      status: row.status,
      combinedReading: row.combined_reading,
      reused: true,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  }

  try {
    const updated = await ensureCombinedReading(row);
    if (!updated.combined_reading?.trim()) {
      await trackWorkerJobFailed(request, "Joint combined generation failed", {
        errorCode: "generation_failed",
      });
      return NextResponse.json(
        { error: "Не удалось синтезировать общий расклад.", code: "generation_failed" },
        { status: 502 }
      );
    }

    if (await claimJointCompletionNotification(updated.token)) {
      await notifyJointReadingEvent({
        userId: updated.initiator_user_id,
        type: "joint_reading_completed",
        token: updated.token,
      });
      if (updated.partner_user_id) {
        await notifyJointReadingEvent({
          userId: updated.partner_user_id,
          type: "joint_reading_completed",
          token: updated.token,
        });
      }
      if (updated.initiator_user_id) {
        void checkJointReadingAchievementsSilently(
          updated.initiator_user_id,
          updated.initiator_character ?? "ragnar"
        );
      }
      if (updated.partner_user_id) {
        void checkJointReadingAchievementsSilently(
          updated.partner_user_id,
          updated.partner_character ?? "ragnar"
        );
      }
    }

    const payload = {
      token: updated.token,
      status: updated.status,
      combinedReading: updated.combined_reading,
      reused: false,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("Joint combined failed:", err);
    const { reportError } = await import("@/lib/error-report");
    reportError(err, { route: "joint-reading/combine" });
    await trackWorkerJobFailed(request, "Joint combined generation failed", {
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      { error: "Не удалось синтезировать общий расклад.", code: "generation_failed" },
      { status: 502 }
    );
  }
}
