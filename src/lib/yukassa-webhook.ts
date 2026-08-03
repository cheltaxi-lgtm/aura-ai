import { completePayment } from "@/lib/session";
import { creditInfluencerBalance } from "@/lib/influencers";
import { creditRunesFromPaymentDetailed } from "@/lib/rune-service";
import { verifyYukassaWebhookPayment, isYukassaConfigured } from "@/lib/yukassa";

export type YukassaWebhookResult = {
  ok: boolean;
  kind: "ignored" | "rune_credited" | "rune_duplicate" | "session_completed" | "rejected";
  paymentId?: string;
};

export async function processYukassaWebhook(body: Record<string, unknown>): Promise<YukassaWebhookResult> {
  const event = body.event as string | undefined;
  const payment = body.object as { id?: string; metadata?: Record<string, string> } | undefined;

  if (event !== "payment.succeeded" || !payment?.id) {
    return { ok: true, kind: "ignored" };
  }

  if (!isYukassaConfigured()) {
    console.warn("[yukassa-webhook] provider not configured", payment.id);
    return { ok: false, kind: "rejected", paymentId: payment.id };
  }

  const verified = await verifyYukassaWebhookPayment(payment.id, event);
  if (!verified.valid) {
    console.warn("[yukassa-webhook] rejected", payment.id, event);
    return { ok: false, kind: "rejected", paymentId: payment.id };
  }
  if (verified.metadata) {
    payment.metadata = { ...payment.metadata, ...verified.metadata };
  }
  const amountRub = verified.amountRub;

  if (payment.metadata?.type === "rune_purchase") {
    const expectedPriceRub = payment.metadata.priceRub
      ? Number(payment.metadata.priceRub)
      : undefined;
    const result = await creditRunesFromPaymentDetailed({
      userId: payment.metadata.userId,
      packageId: payment.metadata.packageId,
      paymentId: payment.id,
      amountRub,
      expectedPriceRub: Number.isFinite(expectedPriceRub) ? expectedPriceRub : undefined,
    });
    console.info(
      "[yukassa-webhook] rune_purchase",
      payment.id,
      result,
      payment.metadata.userId?.slice(0, 8),
      payment.metadata.packageId,
      amountRub
    );
    return {
      ok: result !== "rejected",
      kind:
        result === "credited"
          ? "rune_credited"
          : result === "duplicate"
            ? "rune_duplicate"
            : "rejected",
      paymentId: payment.id,
    };
  }

  if (amountRub === undefined || !Number.isFinite(amountRub)) {
    console.warn("[yukassa-webhook] session payment missing amount", payment.id);
    return { ok: false, kind: "rejected", paymentId: payment.id };
  }

  const result = await completePayment(payment.id, amountRub);
  if (result?.influencer_id && result.amount) {
    await creditInfluencerBalance(
      result.influencer_id,
      Number(result.amount),
      result.blogger_split_percent ?? 80
    );
  }
  console.info("[yukassa-webhook] session_payment", payment.id, result ? "completed" : "skipped");
  return { ok: Boolean(result), kind: result ? "session_completed" : "rejected", paymentId: payment.id };
}
