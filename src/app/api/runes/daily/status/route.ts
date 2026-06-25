import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireProfileUserId } from "@/lib/require-auth";
import { getDailyBonusStatus } from "@/lib/daily-bonus";

export async function GET() {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  try {
    const status = await getDailyBonusStatus(authed.profileUserId);
    return NextResponse.json(status);
  } catch (error) {
    console.error("Daily bonus status error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
