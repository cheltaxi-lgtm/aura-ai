import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  countUnreadNotifications,
  getUnreadNotifications,
  markNotificationsRead,
} from "@/lib/ritual-service";

export async function GET() {
  await ensureDb();

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [items, unreadCount] = await Promise.all([
    getUnreadNotifications(authed.profileUserId),
    countUnreadNotifications(authed.profileUserId),
  ]);
  return NextResponse.json({
    notifications: items,
    items,
    unreadCount,
  });
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
