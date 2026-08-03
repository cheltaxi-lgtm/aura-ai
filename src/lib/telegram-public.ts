/**
 * Public Telegram bot surface for SEO / footer / schema.
 * Keep username in sync with telegram-bot default and NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
 */

export function getPublicTelegramBotUsername(): string {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ||
    process.env.TELEGRAM_BOT_USERNAME?.trim() ||
    "zovus_card_bot"
  );
}

export function getPublicTelegramBotUrl(): string {
  return `https://t.me/${getPublicTelegramBotUsername()}`;
}

export const BRAND_TELEGRAM_LABEL = "Telegram-бот";
