import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import {
  getRuneBalance,
  getUnshownReceipts,
  markReceiptsShown,
} from "@/lib/rune-service";
import { query } from "@/lib/db";
import { ensureDb } from "@/lib/db";

function serializeReceipt(tx: {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  action_type: string | null;
  created_at: Date;
}) {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    balanceAfter: tx.balance_after,
    description: tx.description,
    actionType: tx.action_type,
    createdAt: tx.created_at,
  };
}

export async function GET(request: NextRequest) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const balance = await getRuneBalance(authed.profileUserId);
  const expectedRaw = request.nextUrl.searchParams.get("expected");
  const expected = expectedRaw ? Number(expectedRaw) : null;

  let pending = false;
  let newTransactions: ReturnType<typeof serializeReceipt>[] = [];

  if (await ensureDb()) {
    newTransactions = (await getUnshownReceipts(authed.profileUserId)).map(serializeReceipt);

    if (expected !== null && Number.isFinite(expected) && balance <= expected) {
      const { rows } = await query<{ id: string }>(
        `SELECT id FROM rune_transactions
         WHERE user_id = $1 AND type = 'purchase'
           AND created_at > NOW() - INTERVAL '5 minutes'
         LIMIT 1`,
        [authed.profileUserId]
      );
      pending = rows.length === 0;
    }
  }

  return NextResponse.json({ balance, pending, newTransactions });
}

export async function POST(request: NextRequest) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ids: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.ids)) {
      ids = body.ids.filter((id: unknown) => typeof id === "string");
    }
  } catch {
    /* mark all */
  }

  if (await ensureDb()) {
    await markReceiptsShown(authed.profileUserId, ids);
  }

  return NextResponse.json({ ok: true });
}
