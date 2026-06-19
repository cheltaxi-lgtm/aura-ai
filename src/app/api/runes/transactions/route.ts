import { NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { getRuneTransactions } from "@/lib/rune-service";

export async function GET() {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const transactions = await getRuneTransactions(authed.profileUserId);
  return NextResponse.json({
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balance_after,
      description: t.description,
      actionType: t.action_type,
      createdAt: t.created_at,
    })),
  });
}
