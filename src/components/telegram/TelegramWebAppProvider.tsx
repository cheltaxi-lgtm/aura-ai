"use client";

import { useEffect } from "react";

type TelegramWebApp = {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
  themeParams?: Record<string, string | undefined>;
  platform?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const EXTERNAL_HOST_RE =
  /(?:yookassa\.ru|yoomoney\.ru|oauth\.yandex\.|id\.vk\.|vk\.com|login\.vk\.|accounts\.google\.|appleid\.apple\.|t\.me|telegram\.me)/i;

function isTelegramWebApp(): boolean {
  return Boolean(typeof window !== "undefined" && window.Telegram?.WebApp?.initData);
}

/** Open URL outside Mini App WebView when needed (OAuth / payments). */
export function openTelegramExternalUrl(url: string): void {
  if (typeof window === "undefined") return;
  const tg = window.Telegram?.WebApp;
  if (tg?.openLink && isTelegramWebApp()) {
    try {
      tg.openLink(url, { try_instant_view: false });
      return;
    } catch {
      /* fall through */
    }
  }
  window.location.assign(url);
}

export function useIsTelegramMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  return isTelegramWebApp() || document.documentElement.dataset.telegramWebApp === "1";
}

/**
 * Activates when the page runs inside Telegram Mini App WebView.
 * - Marks document for CSS/app-shell tweaks
 * - Applies salon theme colors
 * - Routes OAuth/payment clicks through openLink
 */
export default function TelegramWebAppProvider() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initData) return;

    document.documentElement.dataset.telegramWebApp = "1";
    document.documentElement.dataset.motionLite = "1";
    try {
      tg.ready?.();
      tg.expand?.();
      tg.setHeaderColor?.("#0E0C0B");
      tg.setBackgroundColor?.("#0E0C0B");
    } catch {
      /* older clients */
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor?.href) return;
      let host = "";
      try {
        host = new URL(anchor.href, window.location.origin).hostname;
      } catch {
        return;
      }
      if (!EXTERNAL_HOST_RE.test(host)) return;
      event.preventDefault();
      openTelegramExternalUrl(anchor.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
