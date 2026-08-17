import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  applyRetentionOptInAction,
  getRetentionOptInSnapshot,
  isRetentionOptInAction,
  isRetentionOptInSurface,
} from "@/lib/retention-optin";

export const dynamic = "force-dynamic";

function forbiddenTargetFields(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    "userId" in o ||
    "accountId" in o ||
    "profileUserId" in o ||
    "email" in o ||
    "targetUserId" in o
  );
}

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getRetentionOptInSnapshot(authed.auth.sub, authed.profileUserId);
  return NextResponse.json(snapshot);
}

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (forbiddenTargetFields(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isRetentionOptInAction(raw.action)) {
    return NextResponse.json({ error: "action_required" }, { status: 400 });
  }
  if (raw.surface !== undefined && !isRetentionOptInSurface(raw.surface)) {
    return NextResponse.json({ error: "invalid_surface" }, { status: 400 });
  }

  const snapshot = await applyRetentionOptInAction({
    accountId: authed.auth.sub,
    profileUserId: authed.profileUserId,
    action: raw.action,
  });
  return NextResponse.json(snapshot);
}
