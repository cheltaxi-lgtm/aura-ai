import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { claimDailyBonus } from "@/lib/daily-bonus";

export async function POST() {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "daily_bonus");
  if (rateLimited) return rateLimited;
  try {
    const result = await claimDailyBonus(authed.profileUserId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Daily bonus claim error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
