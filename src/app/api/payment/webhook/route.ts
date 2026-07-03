import { NextRequest, NextResponse } from "next/server";
import {
  completeYoomoneyPayment,
} from "@/lib/session";
import { creditInfluencerBalance } from "@/lib/influencers";
import {
  parseYoomoneyLabel,
  verifyYoomoneyNotification,
  type YoomoneyNotification,
} from "@/lib/yoomoney";
import { processYukassaWebhook } from "@/lib/yukassa-webhook";

async function handleYukassaWebhook(body: Record<string, unknown>) {
  const result = await processYukassaWebhook(body);
  if (!result.ok) {
    console.error("[payment/webhook] yukassa rejected", result.paymentId, result.kind);
    return NextResponse.json({ error: "Webhook rejected" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, kind: result.kind, paymentId: result.paymentId });
}

async function handleYoomoneyWebhook(data: YoomoneyNotification) {
  if (!verifyYoomoneyNotification(data)) {
    return NextResponse.json({ error: "Invalid sha1 hash" }, { status: 403 });
  }

  if (data.notification_type !== "p2p-incoming" && data.notification_type !== "card-incoming") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (data.currency && data.currency !== "643" && data.currency.toUpperCase() !== "RUB") {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const parsed = parseYoomoneyLabel(data.label);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid label" }, { status: 400 });
  }

  const result = await completeYoomoneyPayment({
    operationId: data.operation_id,
    sessionId: parsed.sessionId,
    plan: parsed.plan,
    amount: parseFloat(data.amount),
  });

  if (result?.influencer_id && result.amount) {
    await creditInfluencerBalance(
      result.influencer_id,
      Number(result.amount),
      result.blogger_split_percent ?? 80
    );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      return handleYukassaWebhook(body);
    }

    const formData = await request.formData();
    const notification: YoomoneyNotification = {
      notification_type: String(formData.get("notification_type") ?? ""),
      operation_id: String(formData.get("operation_id") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      currency: String(formData.get("currency") ?? ""),
      datetime: String(formData.get("datetime") ?? ""),
      sender: String(formData.get("sender") ?? ""),
      codepro: String(formData.get("codepro") ?? "false"),
      label: String(formData.get("label") ?? ""),
      sha1_hash: String(formData.get("sha1_hash") ?? ""),
    };

    return handleYoomoneyWebhook(notification);
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
