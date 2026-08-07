import type { HdReportStatus } from "@/lib/services/human-design-service";

/**
 * Whether creating/resuming an HD report must charge HD_REPORT again.
 * A held transaction_id on pending/error/needs_regeneration means resume-free.
 */
export function hdReportRequiresNewCharge(opts: {
  status: HdReportStatus | null | undefined;
  transactionId: string | null | undefined;
}): boolean {
  if (!opts.transactionId) return true;
  const s = opts.status;
  if (s === "pending" || s === "error" || s === "needs_regeneration") return false;
  return true;
}
