export const BRAND_NAME = "Zovus";
/** Wordmark text beside the Z mark (mark already shows “Z”). */
export const BRAND_WORDMARK = "OVUS";
export const BRAND_DOMAIN = "zovus.ru";
export const BRAND_URL = `https://${BRAND_DOMAIN}`;
export const BRAND_TAGLINE = "приватный цифровой салон";
export const BRAND_PLUS = "Zovus+";
/** Official VK community. */
export const BRAND_VK_URL = "https://vk.ru/zovus";
export const BRAND_VK_LABEL = "Мы ВКонтакте";

/** Official Dzen channel. */
export const BRAND_DZEN_URL = "https://dzen.ru/id/6a50b97e363bf24ef269684e";
export const BRAND_DZEN_LABEL = "Мы в Дзен";

/** Public Telegram bot (SEO / footer). Username from env with safe default. */
export {
  BRAND_TELEGRAM_LABEL,
  getPublicTelegramBotUrl as getBrandTelegramUrl,
  getPublicTelegramBotUsername as getBrandTelegramUsername,
} from "@/lib/telegram-public";

/** Shared header lockup — mark + OVUS + beta. */
export const BRAND_LOGO_HEADER = {
  linkToHome: true,
  showTagline: false,
  showBeta: true,
  markSize: 32,
  titleClassName:
    "font-display text-lg font-semibold tracking-[0.14em] text-[#ede6da] sm:text-2xl",
} as const;

/** Inline breadcrumb / sub-nav — same lockup, smaller scale. */
export const BRAND_LOGO_BREADCRUMB = {
  linkToHome: true,
  showTagline: false,
  showBeta: true,
  markSize: 24,
  titleClassName:
    "font-display text-sm font-semibold tracking-[0.12em] text-[#ede6da] sm:text-base",
} as const;

/** Footer lockup — same identity, no home link. Compact for short footer height. */
export const BRAND_LOGO_FOOTER = {
  showTagline: false,
  showBeta: true,
  markSize: 24,
  titleClassName:
    "font-display text-base font-semibold tracking-[0.14em] text-[#ede6da] sm:text-lg",
} as const;

/** Canonical public site URL (payments, sitemap, OpenRouter referer). */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  return BRAND_URL;
}

export function openRouterAppHeaders(): Record<string, string> {
  const appUrl = getAppUrl();
  const headers: Record<string, string> = { "X-Title": BRAND_NAME };
  if (appUrl) headers["HTTP-Referer"] = appUrl;
  return headers;
}
