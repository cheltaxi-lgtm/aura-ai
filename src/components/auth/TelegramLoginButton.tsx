"use client";

import { useEffect, useRef, useState } from "react";

export type TelegramWidgetUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type Props = {
  onAuth: (user: TelegramWidgetUser) => void;
  botUsername?: string;
  size?: "large" | "medium" | "small";
  cornerRadius?: number;
  requestAccess?: boolean;
  className?: string;
};

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

/**
 * Official Telegram Login Widget.
 * Requires NEXT_PUBLIC_TELEGRAM_BOT_USERNAME and domain allowlisted in BotFather.
 * CSP must allow script-src https://telegram.org and frame-src https://oauth.telegram.org.
 */
export default function TelegramLoginButton({
  onAuth,
  botUsername,
  size = "large",
  cornerRadius = 8,
  requestAccess = true,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const username =
    botUsername ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ||
    "";

  useEffect(() => {
    const container = containerRef.current;
    if (!username || !container) return;

    setLoadState("loading");
    const cbName = `__tgAuth_${Math.random().toString(36).slice(2)}`;
    (window as unknown as Record<string, unknown>)[cbName] = (user: TelegramWidgetUser) => {
      onAuthRef.current(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", username);
    script.setAttribute("data-size", size);
    script.setAttribute("data-radius", String(cornerRadius));
    script.setAttribute("data-onauth", `${cbName}(user)`);
    if (requestAccess) script.setAttribute("data-request-access", "write");
    script.onload = () => setLoadState("ready");
    script.onerror = () => setLoadState("error");

    container.innerHTML = "";
    container.appendChild(script);

    const watchdog = window.setTimeout(() => {
      // Widget injects an iframe; if CSP/BotFather blocks it, surface a fallback.
      if (!container.querySelector("iframe")) {
        setLoadState((prev) => (prev === "error" ? prev : "error"));
      }
    }, 4000);

    return () => {
      window.clearTimeout(watchdog);
      delete (window as unknown as Record<string, unknown>)[cbName];
      container.innerHTML = "";
    };
  }, [username, size, cornerRadius, requestAccess]);

  if (!username) {
    return (
      <p className={`text-sm text-[var(--muted)] ${className ?? ""}`}>
        Вход через Telegram временно недоступен.
      </p>
    );
  }

  return (
    <div className={className}>
      <div ref={containerRef} />
      {loadState === "loading" ? (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">Загрузка входа через Telegram…</p>
      ) : null}
      {loadState === "error" ? (
        <p className="mt-2 text-center text-sm text-[var(--muted)]">
          Виджет Telegram не загрузился. Откройте бота{" "}
          <a
            href={`https://t.me/${username}`}
            className="text-aura-champagne underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            @{username}
          </a>{" "}
          и привяжите аккаунт из меню бота, либо обновите страницу.
        </p>
      ) : null}
    </div>
  );
}
