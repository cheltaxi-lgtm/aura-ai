import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/daily-reminder-service";

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prefs = await getNotificationPrefs(authed.profileUserId);
  return NextResponse.json({ prefs });
}

export async function PATCH(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<NotificationPrefs>;
    const patch: Partial<NotificationPrefs> = {};
    if (typeof body.dailyEmail === "boolean") patch.dailyEmail = body.dailyEmail;
    if (typeof body.dailyInApp === "boolean") patch.dailyInApp = body.dailyInApp;
    if (typeof body.reminderHourMsk === "number") {
      patch.reminderHourMsk = Math.min(23, Math.max(0, Math.round(body.reminderHourMsk)));
    }
    const prefs = await updateNotificationPrefs(authed.profileUserId, patch);
    return NextResponse.json({ prefs });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
