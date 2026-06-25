import { creditRunesFromPayment, getRuneBalance } from "@/lib/rune-service";
import { fetchYukassaPayment, isYukassaConfigured } from "@/lib/yukassa";

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
