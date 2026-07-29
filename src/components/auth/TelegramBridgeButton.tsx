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
  onSuccess?: (result: {
    purpose: Purpose;
    isNewUser?: boolean;
    needsProfile?: boolean;
    username?: string | null;
  }) => void;
  className?: string;
};

const RESUME_KEY = "zovus_tg_bridge";

function botUser(): string {
  return (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "zovus_card_bot").trim();
}

/**
 * Telegram auth via bot deep-link + poll.
 * Opens the bot in a window opened synchronously on click (avoids popup blockers).
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
  const timerRef = useRef<number | null>(null);

  const stopPoll = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const finishError = useCallback(
    (message: string) => {
      stopPoll();
      setWaiting(false);
      setBusy(false);
      setError(message);
      try {
        sessionStorage.removeItem(RESUME_KEY);
      } catch {
        /* ignore */
      }
    },
    [stopPoll]
  );

  const finishSuccess = useCallback(
    (result: {
      purpose: Purpose;
      isNewUser?: boolean;
      needsProfile?: boolean;
      username?: string | null;
    }) => {
      stopPoll();
      setWaiting(false);
      setBusy(false);
      try {
        sessionStorage.removeItem(RESUME_KEY);
      } catch {
        /* ignore */
      }
      onSuccess?.(result);
    },
    [onSuccess, stopPoll]
  );

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

          if (res.ok && data.status === "consumed") {
            finishSuccess({
              purpose: data.purpose || purpose,
              isNewUser: data.isNewUser,
              needsProfile: data.needsProfile,
              username: data.username,
            });
            return;
          }

          if (!res.ok) {
            if (
              res.status === 404 ||
              res.status === 409 ||
              res.status === 400 ||
              data.status === "expired" ||
              data.error === "not_found" ||
              data.error === "consent_required"
            ) {
              finishError(
                data.message ||
                  (data.error === "not_found"
                    ? "Этот Telegram ещё не привязан к аккаунту. Используйте «Регистрация через Telegram» или привяжите Telegram в кабинете."
                    : "Не удалось завершить вход через Telegram.")
              );
            }
            return;
          }

          if (data.status === "expired") {
            finishError("Срок подтверждения истёк. Нажмите кнопку ещё раз.");
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    },
    [finishError, finishSuccess, purpose, stopPoll]
  );

  // Resume poll after return from Telegram (top-level navigation case).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { token?: string; purpose?: Purpose; at?: number };
      if (!saved.token || saved.purpose !== purpose) return;
      if (!saved.at || Date.now() - saved.at > 10 * 60 * 1000) {
        sessionStorage.removeItem(RESUME_KEY);
        return;
      }
      setDeepLink(`https://t.me/${botUser()}?start=a_${saved.token}`);
      setWaiting(true);
      setBusy(true);
      poll(saved.token);
    } catch {
      /* ignore */
    }
  }, [purpose, poll]);

  const start = async () => {
    if (disabled || busy || consentBlocked) {
      if (consentBlocked) {
        setError("Сначала подтвердите возраст и согласие с условиями выше.");
        onConsentNeeded?.();
      }
      return;
    }

    // Open synchronously — required to avoid popup blockers after await.
    const popup = window.open("about:blank", "_blank");

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
      };
      if (!res.ok || !data.ok || !data.token || !data.deepLink) {
        try {
          popup?.close();
        } catch {
          /* ignore */
        }
        finishError(data.message || "Не удалось открыть вход через Telegram.");
        return;
      }

      setDeepLink(data.deepLink);
      setWaiting(true);
      try {
        sessionStorage.setItem(
          RESUME_KEY,
          JSON.stringify({ token: data.token, purpose, at: Date.now() })
        );
      } catch {
        /* ignore */
      }

      let navigatedPopup = false;
      if (popup && !popup.closed) {
        try {
          popup.location.href = data.deepLink;
          navigatedPopup = true;
        } catch {
          try {
            popup.location.replace(data.deepLink);
            navigatedPopup = true;
          } catch {
            navigatedPopup = false;
          }
        }
      }

      if (!navigatedPopup) {
        // Popup blocked: keep page and force user to use explicit link (no top navigate —
        // that would kill React polling on desktop).
        try {
          popup?.close();
        } catch {
          /* ignore */
        }
        setError("Браузер заблокировал окно. Нажмите «Открыть бота» ниже.");
      }

      poll(data.token);
      setBusy(true);
    } catch {
      try {
        popup?.close();
      } catch {
        /* ignore */
      }
      finishError("Не удалось открыть вход через Telegram.");
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
        disabled={disabled || busy || consentBlocked}
        aria-disabled={disabled || busy || consentBlocked || undefined}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2AABEE]/45 bg-[#2AABEE]/15 px-4 py-3 text-sm font-medium text-white transition hover:bg-[#2AABEE]/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span aria-hidden className="inline-block h-4 w-4 rounded-full bg-[#2AABEE]" />
        {busy && !waiting ? "Открываем Telegram…" : label}
      </button>
      {waiting ? (
        <p className="text-center text-xs text-[var(--muted)]">
          В Telegram нажмите Start / Запустить у бота, затем вернитесь сюда — вход завершится сам.
          {deepLink ? (
            <>
              {" "}
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="text-aura-champagne underline-offset-2 hover:underline"
              >
                Открыть бота
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p className="text-center text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
