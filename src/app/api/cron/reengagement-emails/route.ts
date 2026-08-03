import { NextRequest, NextResponse } from "next/server";
import { isCronSecretValid } from "@/lib/cron-auth";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { runReengagementEmailBatch } from "@/lib/reengagement-email-service";

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

  // Bonus reminders: evening MSK (19:00). Inactive win-back: morning (10:00).
  const runBonus = hourMsk === 19;
  const runInactive = hourMsk === 10;

  if (!runBonus && !runInactive) {
    return NextResponse.json({
      hourMsk,
      skipped: true,
      reason: "Outside campaign hours (bonus=19 MSK, inactive=10 MSK)",
      dailyBonus: 0,
      inactive7d: 0,
      inactive14d: 0,
    });
  }

  const result = await runReengagementEmailBatch({
    dailyBonus: runBonus,
    inactive: runInactive,
  });

  return NextResponse.json({ hourMsk, skipped: false, ...result });
}
