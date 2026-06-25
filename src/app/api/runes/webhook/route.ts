import { NextRequest, NextResponse } from "next/server";
import { creditRunesFromPayment } from "@/lib/rune-service";
import { verifyYukassaWebhookPayment, isYukassaConfigured } from "@/lib/yukassa";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();
    if (event.type !== "payment.succeeded" && event.event !== "payment.succeeded") {
      return NextResponse.json({ ok: true });
    }

    const payment = (event.object ?? event) as {
      id?: string;
      metadata?: Record<string, string>;
    };

    if (payment.metadata?.type !== "rune_purchase" || !payment.id) {
      return NextResponse.json({ ok: true });
    }

    let amountRub: number | undefined;

    if (isYukassaConfigured()) {
      const verified = await verifyYukassaWebhookPayment(
        payment.id,
        event.event ?? event.type
      );
      if (!verified.valid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (verified.metadata) {
        payment.metadata = { ...payment.metadata, ...verified.metadata };
      }
      amountRub = verified.amountRub;
    } else if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Payment provider not configured" }, { status: 403 });
    }

    const credited = await creditRunesFromPayment({
      userId: payment.metadata!.userId,
      packageId: payment.metadata!.packageId,
      paymentId: payment.id,
      amountRub,
    });

    if (!credited) {
      console.warn("Rune webhook: credit skipped or already processed:", payment.id);
    }

    return NextResponse.json({ ok: true, credited });
  } catch (error) {
    console.error("Rune webhook error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
