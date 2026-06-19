import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { getRuneBalance } from "@/lib/rune-service";
import { query } from "@/lib/db";
import { ensureDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const balance = await getRuneBalance(authed.profileUserId);
  const expectedRaw = request.nextUrl.searchParams.get("expected");
  const expected = expectedRaw ? Number(expectedRaw) : null;

  let pending = false;
  if (expected !== null && Number.isFinite(expected) && balance <= expected && (await ensureDb())) {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM rune_transactions
       WHERE user_id = $1 AND type = 'purchase'
         AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [authed.profileUserId]
    );
    pending = rows.length === 0;
  }

  return NextResponse.json({ balance, pending });
}
