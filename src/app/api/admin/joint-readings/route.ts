import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureDb } from "@/lib/db";
import { logAdminAction } from "@/lib/admin";
import { getSetting, setSetting } from "@/lib/settings";
import {
  getJointReadingAdminStats,
  listRecentJointReadingsForAdmin,
} from "@/lib/joint-reading-service";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const [settings, stats, recent] = await Promise.all([
    getSetting("jointReading"),
    getJointReadingAdminStats(),
    listRecentJointReadingsForAdmin(30),
  ]);

  return NextResponse.json({ settings, stats, recent });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const body = await request.json();
  const { settings } = body as { settings?: { enabled?: boolean } };
  if (!settings) {
    return NextResponse.json({ error: "Missing settings" }, { status: 400 });
  }

  const updated = await setSetting("jointReading", settings, auth.sub);
  await logAdminAction(auth.sub, "update_settings", "joint_reading", "joint_reading", settings);

  return NextResponse.json({ ok: true, settings: updated });
}
