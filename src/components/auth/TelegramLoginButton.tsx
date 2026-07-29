"use client";

import { useEffect, useRef } from "react";

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
  const username =
    botUsername ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ||
    "";

  useEffect(() => {
    const container = containerRef.current;
    if (!username || !container) return;

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

    container.innerHTML = "";
    container.appendChild(script);

    return () => {
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

  return <div ref={containerRef} className={className} />;
}
