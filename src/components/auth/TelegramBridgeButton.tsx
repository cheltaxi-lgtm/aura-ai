"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Purpose = "login" | "register" | "link";

type Props = {
  purpose: Purpose;
  acceptedTerms?: boolean;
  ageConfirmed?: boolean;
  marketingConsent?: boolean;
  disabled?: boolean;
  consentBlocked?: boolean;
  onConsentNeeded?: () => void;
  /** Called after successful login/register (before redirect) or link. */
  onSuccess?: (result: {
    purpose: Purpose;
    isNewUser?: boolean;
    needsProfile?: boolean;
    username?: string | null;
  }) => void;
  className?: string;
};

/**
 * Primary Telegram auth UX: open bot deep-link and poll site challenge.
 * Works even when BotFather Login Widget domain is not configured.
 */
export default function TelegramBridgeButton({
  purpose,
  acceptedTerms = false,
  ageConfirmed = false,
  marketingConsent = false,
  disabled = false,
  consentBlocked = false,
  onConsentNeeded,
  onSuccess,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const stopPoll = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const poll = useCallback(
    (token: string) => {
      stopPoll();
      timerRef.current = window.setInterval(async () => {
        try {
          const res = await fetch(`/api/auth/telegram/bridge?token=${encodeURIComponent(token)}`, {
            credentials: "include",
            cache: "no-store",
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            status?: string;
            purpose?: Purpose;
            isNewUser?: boolean;
            needsProfile?: boolean;
            username?: string | null;
            message?: string;
            error?: string;
          };
          if (!res.ok) {
            if (res.status === 404 || data.status === "expired") {
              stopPoll();
              setWaiting(false);
              setBusy(false);
              setError(data.message || "Срок подтверждения истёк. Нажмите кнопку ещё раз.");
            }
            return;
          }
          if (data.status === "consumed" || (data.ok && data.status === "consumed")) {
            stopPoll();
            setWaiting(false);
            setBusy(false);
            onSuccess?.({
              purpose: data.purpose || purpose,
              isNewUser: data.isNewUser,
              needsProfile: data.needsProfile,
              username: data.username,
            });
            return;
          }
          if (data.status === "expired") {
            stopPoll();
            setWaiting(false);
            setBusy(false);
            setError("Срок подтверждения истёк. Нажмите кнопку ещё раз.");
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    },
    [onSuccess, purpose, stopPoll]
  );

  const start = async () => {
    if (disabled || busy) return;
    if (consentBlocked) {
      onConsentNeeded?.();
      return;
    }
    setBusy(true);
    setError(null);
    setWaiting(false);
    setDeepLink(null);
    stopPoll();
    try {
      const res = await fetch("/api/auth/telegram/bridge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose,
          acceptedTerms,
          ageConfirmed,
          marketingConsent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        deepLink?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.token || !data.deepLink) {
        setError(data.message || "Не удалось открыть вход через Telegram.");
        setBusy(false);
        return;
      }
      tokenRef.current = data.token;
      setDeepLink(data.deepLink);
      setWaiting(true);
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      poll(data.token);
    } catch {
      setError("Не удалось открыть вход через Telegram.");
      setBusy(false);
    }
  };

  const label =
    purpose === "link"
      ? "Привязать Telegram"
      : purpose === "register"
        ? "Регистрация через Telegram"
        : "Войти через Telegram";

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={disabled || busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2AABEE]/45 bg-[#2AABEE]/15 px-4 py-3 text-sm font-medium text-white transition hover:bg-[#2AABEE]/25 disabled:opacity-50"
      >
        <span aria-hidden className="inline-block h-4 w-4 rounded-full bg-[#2AABEE]" />
        {busy && !waiting ? "Открываем Telegram…" : label}
      </button>
      {waiting ? (
        <p className="text-center text-xs text-[var(--muted)]">
          Подтвердите вход в Telegram, затем вернитесь сюда — страница обновится сама.
          {deepLink ? (
            <>
              {" "}
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="text-aura-champagne underline-offset-2 hover:underline"
              >
                Открыть бота снова
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p className="text-center text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
