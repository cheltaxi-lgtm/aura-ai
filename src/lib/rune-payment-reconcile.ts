import { creditRunesFromPayment } from "@/lib/rune-service";
import { isYukassaConfigured, listRecentYukassaPayments } from "@/lib/yukassa";

export type GlobalRuneReconcileResult = {
  checked: number;
  credited: number;
  skipped: number;
  paymentIds: string[];
};

/** Idempotent sweep: credit any succeeded rune_purchase missing from rune_transactions. */
export async function reconcileAllRecentRunePurchases(
  hoursBack = 72,
  limit = 50
): Promise<GlobalRuneReconcileResult> {
  const result: GlobalRuneReconcileResult = {
    checked: 0,
    credited: 0,
    skipped: 0,
    paymentIds: [],
  };

  if (!isYukassaConfigured()) return result;

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const payments = await listRecentYukassaPayments(since, limit);

  for (const payment of payments) {
    const metadata = payment.metadata ?? {};
    if (payment.status !== "succeeded") continue;
    if (metadata.type !== "rune_purchase") continue;
    if (!metadata.userId || !metadata.packageId) continue;

    result.checked += 1;
    const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
    const credited = await creditRunesFromPayment({
      userId: metadata.userId,
      packageId: metadata.packageId,
      paymentId: payment.id,
      amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
    });

    if (credited) {
      result.credited += 1;
      result.paymentIds.push(payment.id);
      console.info("[rune-reconcile] credited", payment.id, metadata.userId?.slice(0, 8));
    } else {
      result.skipped += 1;
    }
  }

  return result;
}
