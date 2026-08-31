import { NextRequest, NextResponse } from "next/server";
import {
  completeYoomoneyPayment,
} from "@/lib/session";
import { creditInfluencerBalance } from "@/lib/influencers";
import { reportError } from "@/lib/error-report";
import { clientIp } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  parseYoomoneyLabel,
  verifyYoomoneyNotification,
  type YoomoneyNotification,
} from "@/lib/yoomoney";
import { processYukassaWebhook } from "@/lib/yukassa-webhook";

async function handleYukassaWebhook(body: Record<string, unknown>) {
  const result = await processYukassaWebhook(body);
  if (!result.ok) {
    reportError(new Error("yukassa_webhook_rejected"), {
      route: "payment/webhook",
      paymentId: result.paymentId,
      kind: result.kind,
    });
    return NextResponse.json({ error: "Webhook rejected" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

async function handleYoomoneyWebhook(data: YoomoneyNotification & { test_notification?: string }) {
  if (!verifyYoomoneyNotification(data)) {
    return NextResponse.json({ error: "Invalid sha1 hash" }, { status: 403 });
  }

  if (data.test_notification === "true" || data.test_notification === "1") {
    return NextResponse.json({ ok: true, skipped: true });
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

  if (!result) {
    // Keep pending unlock retryable — do not ACK a failed match.
    return NextResponse.json({ error: "Payment not completed" }, { status: 409 });
  }

  if (result.influencer_id && result.amount) {
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
    // Cheap per-IP cap before any outbound work: every forged POST otherwise
    // triggers one authenticated YuKassa API lookup (amplification noise).
    // Legit providers retry on non-200, so a transient 429 loses no payment.
    const ip = clientIp(request);
    const { allowed, retryAfterSec } = await checkRateLimit(
      rateLimitKey("payment_webhook", ip),
      30,
      60_000
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      return handleYukassaWebhook(body);
    }

    const formData = await request.formData();
    const notification: YoomoneyNotification & { test_notification?: string } = {
      notification_type: String(formData.get("notification_type") ?? ""),
      operation_id: String(formData.get("operation_id") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      currency: String(formData.get("currency") ?? ""),
      datetime: String(formData.get("datetime") ?? ""),
      sender: String(formData.get("sender") ?? ""),
      codepro: String(formData.get("codepro") ?? "false"),
      label: String(formData.get("label") ?? ""),
      sha1_hash: String(formData.get("sha1_hash") ?? ""),
      test_notification: String(formData.get("test_notification") ?? ""),
    };

    return handleYoomoneyWebhook(notification);
  } catch (error) {
    reportError(error, { route: "payment/webhook" });
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
