import { completePayment } from "@/lib/session";
import { creditInfluencerBalance } from "@/lib/influencers";
import { creditRunesFromPayment } from "@/lib/rune-service";
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
    const credited = await creditRunesFromPayment({
      userId: payment.metadata.userId,
      packageId: payment.metadata.packageId,
      paymentId: payment.id,
      amountRub,
    });
    console.info(
      "[yukassa-webhook] rune_purchase",
      payment.id,
      credited ? "credited" : "duplicate",
      payment.metadata.userId?.slice(0, 8),
      payment.metadata.packageId,
      amountRub
    );
    return {
      ok: true,
      kind: credited ? "rune_credited" : "rune_duplicate",
      paymentId: payment.id,
    };
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
  return { ok: true, kind: "session_completed", paymentId: payment.id };
}
