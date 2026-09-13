import { createHash } from "node:crypto";

/** Stable UUID-shaped YooKassa order id for one Telegram user action. */
export function telegramPaymentRequestId(
  telegramUserId: number,
  eventId: string
): string {
  const hex = createHash("sha256")
    .update(`zovus-runes:${telegramUserId}:${eventId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}
