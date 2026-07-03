import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { asyncJobPollPayload, getAsyncJobForUser } from "@/lib/async-jobs";
import { requireProfileUserId } from "@/lib/require-auth";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { id } = await context.params;
  const job = await getAsyncJobForUser(id, authed.profileUserId);
  if (!job) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(asyncJobPollPayload(job));
}
