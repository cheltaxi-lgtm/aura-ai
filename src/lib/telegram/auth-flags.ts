/**
 * Compliance: Telegram must not authenticate users (149-FZ art.8 p.10 / 406-FZ).
 * Login Widget and any "sign in with Telegram" paths stay off unless explicitly forced
 * for local emergency debugging (never in production).
 */
export function isTelegramLoginEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.TELEGRAM_AUTH_LOGIN_ENABLED?.trim() === "true";
}
