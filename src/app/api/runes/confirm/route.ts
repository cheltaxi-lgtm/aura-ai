import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { confirmOrReconcileRunePurchase } from "@/lib/rune-payment-confirm";

export async function POST(request: NextRequest) {
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let paymentId: string | undefined;
  try {
    const body = await request.json();
    paymentId = typeof body.paymentId === "string" ? body.paymentId.trim() : undefined;
  } catch {
    /* allow empty body — reconcile recent */
  }

  const result = await confirmOrReconcileRunePurchase(authed.profileUserId, paymentId);

  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (result.status === "invalid") {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    balance: result.balance,
    paymentId: result.paymentId,
    credited: result.status === "credited",
    pending: result.status === "pending",
    alreadyCredited: result.status === "already_credited",
  });
}
