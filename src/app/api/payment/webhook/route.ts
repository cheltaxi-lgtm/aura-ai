import { NextRequest, NextResponse } from "next/server";
import {
  completePayment,
  completeYoomoneyPayment,
} from "@/lib/session";
import {
  parseYoomoneyLabel,
  verifyYoomoneyNotification,
  type YoomoneyNotification,
} from "@/lib/yoomoney";
import { creditInfluencerBalance } from "@/lib/influencers";
import { creditRunesFromPayment } from "@/lib/rune-service";
import { ensureDb, query } from "@/lib/db";
import { verifyYukassaWebhookPayment, isYukassaConfigured } from "@/lib/yukassa";

async function handleYukassaWebhook(body: Record<string, unknown>) {
  const event = body.event as string | undefined;
  const payment = body.object as { id?: string; metadata?: Record<string, string> } | undefined;

  if (event !== "payment.succeeded" || !payment?.id) {
    return;
  }

  if (isYukassaConfigured()) {
    const verified = await verifyYukassaWebhookPayment(payment.id, event);
    if (!verified.valid) {
      console.warn("YooKassa webhook rejected:", payment.id);
      return;
    }
    if (verified.metadata) {
      payment.metadata = { ...payment.metadata, ...verified.metadata };
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn("YooKassa webhook rejected: not configured");
    return;
  }

  if (payment.metadata?.type === "rune_purchase") {
    await creditRunesFromPayment({
      userId: payment.metadata.userId,
      packageId: payment.metadata.packageId,
      runesAmount: payment.metadata.runesAmount,
      paymentId: payment.id,
    });
    return;
  }

  const result = await completePayment(payment.id);
  if (result?.influencer_id && result.amount) {
    await creditInfluencerBalance(
      result.influencer_id,
      Number(result.amount),
      result.blogger_split_percent ?? 80
    );
  }
}

async function handleYoomoneyWebhook(data: YoomoneyNotification) {
  if (!verifyYoomoneyNotification(data)) {
    return NextResponse.json({ error: "Invalid sha1 hash" }, { status: 403 });
  }

  if (data.notification_type !== "p2p-incoming" && data.notification_type !== "card-incoming") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const parsed = parseYoomoneyLabel(data.label);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid label" }, { status: 400 });
  }

  await completeYoomoneyPayment({
    operationId: data.operation_id,
    sessionId: parsed.sessionId,
    plan: parsed.plan,
    amount: parseFloat(data.amount),
  });

  if (await ensureDb()) {
    const { rows } = await query<{
      influencer_id: string | null;
      amount: string;
      blogger_split_percent: number | null;
      status: string;
    }>(
      `SELECT influencer_id, amount::text, blogger_split_percent, status FROM payments
       WHERE yoomoney_operation_id = $1 OR order_id LIKE $2
       LIMIT 1`,
      [data.operation_id, `%${parsed.sessionId.slice(0, 8)}%`]
    );
    const row = rows[0];
    if (row?.influencer_id && row.status === "succeeded") {
      await creditInfluencerBalance(
        row.influencer_id,
        parseFloat(row.amount),
        row.blogger_split_percent ?? 80
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      await handleYukassaWebhook(body);
      return NextResponse.json({ ok: true });
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
