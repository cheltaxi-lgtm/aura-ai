import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  sweepExpiredJointReadings,
  sendExpiringJointReadingReminders,
} from "@/lib/joint-reading-service";

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = cronSecret && headerSecret === cronSecret;
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expired = await sweepExpiredJointReadings();
  const reminded = await sendExpiringJointReadingReminders();

  return NextResponse.json({ expired, reminded });
}
