"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
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

function sameDestination(to: string): boolean {
  try {
    const u = new URL(to, window.location.origin);
    return u.pathname === window.location.pathname && u.search === window.location.search;
  } catch {
    return false;
  }
}

/**
 * Activates when the page runs inside Telegram Mini App WebView.
 * - Marks document for CSS/app-shell tweaks
 * - Applies salon theme colors
 * - Routes OAuth/payment clicks through openLink
 * - Pulls bot-parked navigation into THIS shell (no second Mini App window)
 */
export default function TelegramWebAppProvider() {
  const router = useRouter();
  const pathname = usePathname();

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

  useEffect(() => {
    if (!isTelegramWebApp()) return;
    // /tg bootstrap already consumes pending via webapp auth.
    if (pathname === "/tg") return;

    let cancelled = false;

    async function pullNav() {
      try {
        const res = await fetch("/api/telegram/miniapp-nav", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { ok?: boolean; to?: string | null };
        if (!data.to || sameDestination(data.to)) return;
        router.replace(data.to);
      } catch {
        /* ignore */
      }
    }

    void pullNav();
    const onVis = () => {
      if (document.visibilityState === "visible") void pullNav();
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(() => void pullNav(), 2500);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}
