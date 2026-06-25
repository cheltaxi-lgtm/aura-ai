import { NextRequest, NextResponse } from "next/server";
import { requireProfileUserId } from "@/lib/require-auth";
import { confirmRunePurchaseForUser } from "@/lib/rune-payment-confirm";

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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!paymentId) {
    return NextResponse.json({ error: "paymentId required" }, { status: 400 });
  }

  const result = await confirmRunePurchaseForUser(paymentId, authed.profileUserId);

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
    credited: result.status === "credited",
    pending: result.status === "pending",
  });
}
