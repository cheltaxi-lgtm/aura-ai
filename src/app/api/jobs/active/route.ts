import { NextRequest, NextResponse } from "next/server";

import {
  asyncJobPollPayload,
  listActiveAsyncJobsForUser,
  type AsyncJobKind,
} from "@/lib/async-jobs";
import { ensureDb } from "@/lib/db";
import { profileAuthFailureResponse, resolveProfileUserContext } from "@/lib/require-auth";

const KIND_SET = new Set<AsyncJobKind>([
  "reading",
  "image_generate",
  "natal_interpretation",
  "natal_forecast",
  "natal_compatibility",
  "intention_spread",
  "daily_reading",
  "daily_extended",
  "joint_reading",
  "joint_combined",
  "photo_reading",
  "ritual_generation",
  "numerology_reading",
]);

export async function GET(request: NextRequest) {
  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const rawKinds = request.nextUrl.searchParams.get("kind") ?? "";
  const kinds = rawKinds
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is AsyncJobKind => KIND_SET.has(value as AsyncJobKind));

  const jobs = await listActiveAsyncJobsForUser(
    resolved.profileUserId,
    kinds.length ? kinds : undefined
  );

  return NextResponse.json({
    jobs: jobs.map((job) => asyncJobPollPayload(job)),
  });
}
