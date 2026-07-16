import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { ensureDb } from "@/lib/db";
import { resetTripletCooldown, getUserById } from "@/lib/users";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const result = await resetTripletCooldown(userId);
    if (!result.ok) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    await logAdminAction(auth.sub, "reset_triplet_cooldown", "user", userId, {
      deletedHistory: result.deletedHistory,
      deletedDailyHistory: result.deletedDailyHistory,
      deletedDailyReadings: result.deletedDailyReadings,
      hadTripletAnchor: result.hadTripletAnchor,
      hadDailyAnchor: result.hadDailyAnchor,
    });
    return NextResponse.json({
      ok: true,
      deletedHistory: result.deletedHistory,
      deletedDailyHistory: result.deletedDailyHistory,
      deletedDailyReadings: result.deletedDailyReadings,
      hadTripletAnchor: result.hadTripletAnchor,
      hadDailyAnchor: result.hadDailyAnchor,
    });
  } catch (err) {
    console.error("resetTripletCooldown error:", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
