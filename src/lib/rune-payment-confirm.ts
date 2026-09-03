import {
  creditRunesFromPaymentDetailed,
  getRuneBalance,
} from "@/lib/rune-service";
import {
  fetchYukassaPayment,
  isYukassaConfigured,
  listRecentYukassaPayments,
} from "@/lib/yukassa";

function parseExpectedPrice(metadata: Record<string, string> | undefined): number | undefined {
  const raw = metadata?.priceRub ?? metadata?.expectedPriceRub;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function confirmRunePurchaseForUser(
  paymentId: string,
  profileUserId: string
): Promise<{
  status:
    | "credited"
    | "already_credited"
    | "rejected"
    | "pending"
    | "cancelled"
    | "invalid"
    | "forbidden";
  balance: number;
  amountRub?: number;
  packageId?: string;
  packageName?: string;
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

  if (payment.status === "canceled") {
    return { status: "cancelled", balance };
  }

  if (payment.status !== "succeeded") {
    return { status: "pending", balance };
  }
  if (payment.paid !== true || payment.amount?.currency !== "RUB") {
    return { status: "invalid", balance };
  }

  const metadata = payment.metadata ?? {};
  if (metadata.type !== "rune_purchase" || !metadata.packageId) {
    return { status: "invalid", balance };
  }

  if (metadata.userId !== profileUserId) {
    return { status: "forbidden", balance };
  }

  const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
  const result = await creditRunesFromPaymentDetailed({
    userId: profileUserId,
    packageId: metadata.packageId,
    paymentId: payment.id,
    amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
    expectedPriceRub: parseExpectedPrice(metadata),
  });

  const newBalance = await getRuneBalance(profileUserId);
  const status =
    result === "credited"
      ? "credited"
      : result === "duplicate"
        ? "already_credited"
        : "rejected";

  return {
    status,
    balance: newBalance,
    amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
    packageId: metadata.packageId,
    packageName: metadata.packageName,
  };
}

/** Server-side fallback when webhook missed and client lost paymentId. */
export async function reconcileRecentRunePurchasesForUser(profileUserId: string): Promise<{
  credited: boolean;
  balance: number;
  paymentId?: string;
  amountRub?: number;
  packageId?: string;
  packageName?: string;
}> {
  const balance = await getRuneBalance(profileUserId);
  if (!isYukassaConfigured()) {
    return { credited: false, balance };
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  // Paginate shop-wide list so a busy merchant window does not hide this user.
  const payments = await listRecentYukassaPayments(since, 300);

  for (const payment of payments) {
    const metadata = payment.metadata ?? {};
    if (payment.status !== "succeeded") continue;
    if (payment.paid !== true || payment.amount?.currency !== "RUB") continue;
    if (metadata.type !== "rune_purchase") continue;
    if (metadata.userId !== profileUserId) continue;
    if (!metadata.packageId) continue;

    const amountRub = payment.amount?.value ? Number(payment.amount.value) : undefined;
    const result = await creditRunesFromPaymentDetailed({
      userId: profileUserId,
      packageId: metadata.packageId,
      paymentId: payment.id,
      amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
      expectedPriceRub: parseExpectedPrice(metadata),
    });
    if (result === "credited") {
      return {
        credited: true,
        balance: await getRuneBalance(profileUserId),
        paymentId: payment.id,
        amountRub: Number.isFinite(amountRub) ? amountRub : undefined,
        packageId: metadata.packageId,
        packageName: metadata.packageName,
      };
    }
  }

  return { credited: false, balance };
}

export async function confirmRunePurchaseByOrderId(
  orderId: string,
  profileUserId: string
): Promise<{
  status:
    | "credited"
    | "already_credited"
    | "rejected"
    | "pending"
    | "cancelled"
    | "invalid"
    | "forbidden"
    | "none";
  balance: number;
  paymentId?: string;
  amountRub?: number;
  packageId?: string;
  packageName?: string;
}> {
  const balance = await getRuneBalance(profileUserId);
  if (!orderId.trim() || !isYukassaConfigured()) {
    return { status: "invalid", balance };
  }

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const payments = await listRecentYukassaPayments(since, 300);
  const match = payments.find(
    (p) =>
      p.metadata?.orderId === orderId.trim() &&
      p.metadata?.type === "rune_purchase" &&
      p.metadata?.userId === profileUserId
  );
  if (!match) {
    return { status: "none", balance };
  }
  const direct = await confirmRunePurchaseForUser(match.id, profileUserId);
  return { ...direct, paymentId: match.id };
}

export async function confirmOrReconcileRunePurchase(
  profileUserId: string,
  paymentId?: string | null,
  orderId?: string | null
): Promise<{
  status:
    | "credited"
    | "already_credited"
    | "rejected"
    | "pending"
    | "cancelled"
    | "invalid"
    | "forbidden"
    | "none";
  balance: number;
  paymentId?: string;
  amountRub?: number;
  packageId?: string;
  packageName?: string;
}> {
  if (paymentId?.trim()) {
    const direct = await confirmRunePurchaseForUser(paymentId.trim(), profileUserId);
    return { ...direct, paymentId: paymentId.trim() };
  }

  if (orderId?.trim()) {
    return confirmRunePurchaseByOrderId(orderId.trim(), profileUserId);
  }

  const reconciled = await reconcileRecentRunePurchasesForUser(profileUserId);
  if (reconciled.credited) {
    return {
      status: "credited",
      balance: reconciled.balance,
      paymentId: reconciled.paymentId,
      amountRub: reconciled.amountRub,
      packageId: reconciled.packageId,
      packageName: reconciled.packageName,
    };
  }

  return { status: "none", balance: reconciled.balance };
}
