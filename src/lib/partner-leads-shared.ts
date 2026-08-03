/** Client-safe partner lead enums/labels (no DB imports). */

export type PartnerLeadStatus = "new" | "in_progress" | "done" | "spam";

export const PARTNER_LEAD_STATUS_LABELS: Record<PartnerLeadStatus, string> = {
  new: "Новая",
  in_progress: "В работе",
  done: "Закрыта",
  spam: "Спам",
};

export function isValidPartnerLeadStatus(v: string): v is PartnerLeadStatus {
  return ["new", "in_progress", "done", "spam"].includes(v);
}
