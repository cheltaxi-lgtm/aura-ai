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
    if (error instanceof Error && error.message === "bonus_email_verification_required") {
      return NextResponse.json({ error: "Подтвердите почту в кабинете, чтобы получать бонусы.", code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "runes_disabled") {
      return NextResponse.json({ error: "Система рун временно недоступна." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "bonus_user_not_found") {
      return NextResponse.json({ error: "Профиль не найден." }, { status: 404 });
    }
    console.error("Daily bonus claim error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
