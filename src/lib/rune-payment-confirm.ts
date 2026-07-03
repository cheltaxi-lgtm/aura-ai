import { creditRunesFromPayment, getRuneBalance } from "@/lib/rune-service";
import { fetchYukassaPayment, isYukassaConfigured, listRecentYukassaPayments } from "@/lib/yukassa";

export async function confirmRunePurchaseForUser(
  paymentId: string,
  profileUserId: string
): Promise<{
  status: "credited" | "already_credited" | "pending" | "invalid" | "forbidden";
  balance: number;
}> {
  const balance = await getRuneBalance(profileUserId);

  if (!paymentId?.trim()) {
    return { status: "invalid", balance };
  }

  if (!isYukassaConfigured()) {
    return { status: "invalid", balance };
  }

  const payment = await fetchYukassaPayment(paymentId.trim());
  if (!payment) {
    return { status: "invalid", balance };
  }

  if (payment.status !== "succeeded") {
    return { status: "pending", balance };
  }

  const metadata = payment.metadata ?? {};
  if (metadata.type !== "rune_purchase" || !metadata.packageId) {
    return { status: "invalid", balance };
  }

  if (metadata.userId !== profileUserId) {
    return { status: "forbidden", balance };
  }

  const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
  const credited = await creditRunesFromPayment({
    userId: profileUserId,
    packageId: metadata.packageId,
    paymentId: payment.id,
    amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
  });

  const newBalance = await getRuneBalance(profileUserId);
  return {
    status: credited ? "credited" : "already_credited",
    balance: newBalance,
  };
}

/** Server-side fallback when webhook missed and client lost paymentId. */
export async function reconcileRecentRunePurchasesForUser(profileUserId: string): Promise<{
  credited: boolean;
  balance: number;
  paymentId?: string;
}> {
  const balance = await getRuneBalance(profileUserId);
  if (!isYukassaConfigured()) {
    return { credited: false, balance };
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const payments = await listRecentYukassaPayments(since, 30);

  for (const payment of payments) {
    const metadata = payment.metadata ?? {};
    if (payment.status !== "succeeded") continue;
    if (metadata.type !== "rune_purchase") continue;
    if (metadata.userId !== profileUserId) continue;
    if (!metadata.packageId) continue;

    const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
    const credited = await creditRunesFromPayment({
      userId: profileUserId,
      packageId: metadata.packageId,
      paymentId: payment.id,
      amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
    });
    if (credited) {
      return {
        credited: true,
        balance: await getRuneBalance(profileUserId),
        paymentId: payment.id,
      };
    }
  }

  return { credited: false, balance };
}

export async function confirmOrReconcileRunePurchase(
  profileUserId: string,
  paymentId?: string | null
): Promise<{
  status: "credited" | "already_credited" | "pending" | "invalid" | "forbidden" | "none";
  balance: number;
  paymentId?: string;
}> {
  if (paymentId?.trim()) {
    const direct = await confirmRunePurchaseForUser(paymentId.trim(), profileUserId);
    return { ...direct, paymentId: paymentId.trim() };
  }

  const reconciled = await reconcileRecentRunePurchasesForUser(profileUserId);
  if (reconciled.credited) {
    return {
      status: "credited",
      balance: reconciled.balance,
      paymentId: reconciled.paymentId,
    };
  }

  return { status: "none", balance: reconciled.balance };
}
