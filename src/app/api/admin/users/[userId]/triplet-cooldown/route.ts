import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin";
import { ensureDb } from "@/lib/db";
import { resetTripletCooldown } from "@/lib/users";
import { query } from "@/lib/db";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const { rows } = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
  if (!rows[0]) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const result = await resetTripletCooldown(userId);
    // Also clear the daily "Энергия дня" reading so the premium modal can be
    // re-run immediately (used for testing the daily spread flow).
    const dailyReset = await query(
      "DELETE FROM daily_readings WHERE user_id = $1",
      [userId]
    );
    const deletedDailyReadings = dailyReset.rowCount ?? 0;
    await logAdminAction(auth.sub, "reset_triplet_cooldown", "user", userId, {
      deletedHistory: result.deletedHistory,
      hadAnchor: result.hadAnchor,
      deletedDailyReadings,
    });
    return NextResponse.json({
      ok: true,
      deletedHistory: result.deletedHistory,
      hadAnchor: result.hadAnchor,
      deletedDailyReadings,
    });
  } catch (err) {
    console.error("resetTripletCooldown error:", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
