/** Системный отправитель автоответа поддержки (не admin_accounts). */
export const SUPPORT_SYSTEM_SENDER_ID = "00000000-0000-0000-0000-000000000001";

export function isSupportSystemSender(senderId: string): boolean {
  return senderId === SUPPORT_SYSTEM_SENDER_ID;
}
