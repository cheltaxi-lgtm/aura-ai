import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { sendDailyRemindersForHour } from "@/lib/daily-reminder-service";

export async function GET(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret");
  const isInternal = cronSecret && headerSecret === cronSecret;
  const admin = await requireAdmin();

  if (!isInternal && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const hourParam = request.nextUrl.searchParams.get("hourMsk");
  const hourMsk =
    hourParam !== null && hourParam !== ""
      ? Math.min(23, Math.max(0, Number(hourParam)))
      : new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" })).getHours();

  const result = await sendDailyRemindersForHour(Number.isFinite(hourMsk) ? hourMsk : 9);

  return NextResponse.json({ hourMsk, ...result });
}
