"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import {
  decodeMiniAppStartParam,
  sanitizeMiniAppPath,
} from "@/lib/telegram/mini-app";

type Props = {
  to: string;
};

type AuthOk = { ok: true; to: string; needsOnboarding?: boolean };
type AuthFail = {
  ok: false;
  error?: string;
  message?: string;
  linkLoginUrl?: string;
  to?: string;
};

function resolveDestination(fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const tg = window.Telegram?.WebApp;
  const startParam =
    tg?.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get("tgWebAppStartParam") ||
    new URLSearchParams(window.location.search).get("startapp");
  const fromStart = decodeMiniAppStartParam(startParam);
  return sanitizeMiniAppPath(fromStart || fallback);
}

export default function TgMiniAppClient({ to }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "needs_link" | "error">("loading");
  const [message, setMessage] = useState("Открываю Zovus…");
  const initialTo = useMemo(() => to || "/cabinet", [to]);
  const [loginUrl, setLoginUrl] = useState(
    `/auth/user/login?returnTo=${encodeURIComponent(initialTo)}&utm_source=telegram&utm_medium=miniapp`
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap(initData: string, dest: string) {
      try {
        const res = await fetch("/api/auth/telegram/webapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ initData, to: dest }),
        });
        const data = (await res.json()) as AuthOk | AuthFail;
        if (cancelled) return;

        if (data.ok) {
          router.replace(data.to || dest);
          return;
        }

        if (data.error === "needs_link") {
          setLoginUrl(
            data.linkLoginUrl ||
              `/auth/user/login?returnTo=${encodeURIComponent(dest)}&utm_source=telegram&utm_medium=miniapp`
          );
          setMessage(
            data.message ||
              "Привяжите аккаунт Zovus, чтобы открыть кабинет внутри Telegram."
          );
          setStatus("needs_link");
          return;
        }

        setMessage(
          data.message ||
            (data.error === "not_configured"
              ? "Mini App временно недоступен."
              : "Не удалось войти через Telegram. Откройте ссылку ещё раз.")
        );
        setStatus("error");
      } catch {
        if (!cancelled) {
          setMessage("Связь с сайтом прервалась. Попробуйте ещё раз.");
          setStatus("error");
        }
      }
    }

    function run() {
      document.documentElement.dataset.telegramWebApp = "1";
      document.documentElement.dataset.motionLite = "1";
      const tg = window.Telegram?.WebApp;
      if (tg) {
        try {
          tg.ready?.();
          tg.expand?.();
          tg.setHeaderColor?.("#0E0C0B");
          tg.setBackgroundColor?.("#0E0C0B");
        } catch {
          /* ignore */
        }
      }
      const dest = resolveDestination(initialTo);
      const initData = tg?.initData || "";
      if (!initData) {
        // Opened outside Telegram — send user to the destination directly.
        router.replace(dest);
        return;
      }
      void bootstrap(initData, dest);
    }

    // Script may load after first paint.
    if (window.Telegram?.WebApp) {
      run();
    } else {
      const t = window.setTimeout(run, 400);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [router, initialTo]);

  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-[#C4A574]">Zovus</p>
        <h1 className="mt-4 font-display text-3xl text-[#F5EDE3]">
          {status === "needs_link" ? "Привязка аккаунта" : "Салон внутри Telegram"}
        </h1>
        <p className="mt-4 text-base text-[#C9B8A4]">{message}</p>

        {status === "loading" && (
          <div className="mt-10 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#C4A574]" />
          </div>
        )}

        {status === "needs_link" && (
          <div className="mt-10 flex w-full max-w-sm flex-col gap-3">
            <button
              type="button"
              className="rounded-full border border-[#C4A574]/50 bg-[#C4A574]/15 px-5 py-3 text-[#F5EDE3]"
              onClick={() => router.replace(loginUrl)}
            >
              Войти и привязать аккаунт
            </button>
            <button
              type="button"
              className="rounded-full border border-white/15 px-5 py-3 text-[#C9B8A4]"
              onClick={() => router.replace(initialTo)}
            >
              Открыть без входа
            </button>
          </div>
        )}

        {status === "error" && (
          <button
            type="button"
            className="mt-10 rounded-full border border-[#C4A574]/50 px-5 py-3 text-[#F5EDE3]"
            onClick={() => window.location.reload()}
          >
            Повторить
          </button>
        )}
      </main>
    </>
  );
}
