import { BillingService } from "./billing-service";

/** Never advertise a refund or clear a durable charge until the ledger confirms it. */
export async function refundReadingCharge(
  params: Parameters<typeof BillingService.rollbackCharge>[0],
  onConfirmed?: () => Promise<void>
): Promise<{ balance: number; refunded: boolean }> {
  const outcome = await BillingService.rollbackChargeEx(params);
  if (params.cost > 0 && !outcome.refunded) throw new Error("reading_refund_failed");
  if (outcome.refunded) await onConfirmed?.();
  return outcome;
}
