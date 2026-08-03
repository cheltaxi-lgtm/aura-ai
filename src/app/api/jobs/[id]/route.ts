import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { asyncJobPollPayload, getAsyncJobForUser } from "@/lib/async-jobs";
import { resolveProfileUserContext, profileAuthFailureResponse } from "@/lib/require-auth";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const { id } = await context.params;
  const job = await getAsyncJobForUser(id, resolved.profileUserId);
  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(asyncJobPollPayload(job));
}
