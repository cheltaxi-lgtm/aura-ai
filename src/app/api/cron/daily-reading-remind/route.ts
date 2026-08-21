import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { sendDailyRemindersForHour } from "@/lib/daily-reminder-service";

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const isInternal = isCronSecretValid(request);
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hourParam = request.nextUrl.searchParams.get("hourMsk");
  const hourMsk =
    hourParam !== null && hourParam !== ""
      ? Math.min(23, Math.max(0, Number(hourParam)))
      : new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })).getHours();

  const result = await sendDailyRemindersForHour(Number.isFinite(hourMsk) ? hourMsk : 6);

  return NextResponse.json({ hourMsk, ...result });
}
