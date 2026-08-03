import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  sweepExpiredJointReadings,
  sendExpiringJointReadingReminders,
} from "@/lib/joint-reading-service";

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const expired = await sweepExpiredJointReadings();
  const reminded = await sendExpiringJointReadingReminders();

  return NextResponse.json({ expired, reminded });
}
