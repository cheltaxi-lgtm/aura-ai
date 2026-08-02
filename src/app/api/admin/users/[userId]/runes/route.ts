import { NextRequest, NextResponse } from "next/server";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { getAdminRuneGrantCap } from "@/lib/admin-settings-validate";
import { ensureDb } from "@/lib/db";
import { adminGrantRunes } from "@/lib/rune-service";
import { query } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  let amount: number;
  let reason: string;
  try {
    const body = await request.json();
    amount = Math.round(Number(body.amount));
    reason = String(body.reason ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const grantCap = getAdminRuneGrantCap();
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  }
  if (amount > grantCap) {
    return NextResponse.json(
      { error: `amount exceeds max ${grantCap} per grant` },
      { status: 400 }
    );
  }
  if (!reason || reason.length < 2) {
    return NextResponse.json({ error: "reason required" }, { status: 400 });
  }

  const { rows } = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
  if (!rows[0]) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const newBalance = await adminGrantRunes(userId, amount, reason, auth.sub);
    return NextResponse.json({ ok: true, newBalance, granted: amount });
  } catch (err) {
    console.error("adminGrantRunes error:", err);
    return NextResponse.json({ error: "Grant failed" }, { status: 500 });
  }
}
