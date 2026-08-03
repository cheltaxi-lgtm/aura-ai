import { NextRequest, NextResponse } from "next/server";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { logAdminAction } from "@/lib/admin";
import { creditRunesFromPayment, getRuneBalance } from "@/lib/rune-service";
import { fetchYukassaPayment, isYukassaConfigured } from "@/lib/yukassa";

export async function POST(request: NextRequest) {
  const stepped = await requireAdminStepUp(request);
  if (!stepped.ok) return stepped.response;
  const auth = stepped.auth;

  if (!isYukassaConfigured()) {
    return NextResponse.json({ error: "YooKassa not configured" }, { status: 503 });
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

  const payment = await fetchYukassaPayment(paymentId);
  if (!payment) {
    return NextResponse.json({ error: "Payment not found in YooKassa" }, { status: 404 });
  }

  if (payment.status !== "succeeded") {
    return NextResponse.json(
      { error: `Payment status: ${payment.status}` },
      { status: 409 }
    );
  }

  const metadata = payment.metadata ?? {};
  if (metadata.type !== "rune_purchase" || !metadata.userId || !metadata.packageId) {
    return NextResponse.json({ error: "Not a rune purchase" }, { status: 400 });
  }

  const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
  const credited = await creditRunesFromPayment({
    userId: metadata.userId,
    packageId: metadata.packageId,
    paymentId: payment.id,
    amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
  });

  const balance = await getRuneBalance(metadata.userId);
  await logAdminAction(auth.sub, "reconcile_rune_payment", "user", metadata.userId, {
    paymentId: payment.id,
    packageId: metadata.packageId,
    credited,
    balance,
  });

  return NextResponse.json({
    ok: true,
    credited,
    userId: metadata.userId,
    balance,
    paymentStatus: payment.status,
  });
}
