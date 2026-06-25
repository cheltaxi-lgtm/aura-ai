import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  getUnreadNotifications,
  markNotificationsRead,
} from "@/lib/ritual-service";

export async function GET() {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notifications = await getUnreadNotifications(authed.profileUserId);
  return NextResponse.json({ notifications });
}

export async function POST(_request: NextRequest) {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markNotificationsRead(authed.profileUserId);
  return NextResponse.json({ ok: true });
}
