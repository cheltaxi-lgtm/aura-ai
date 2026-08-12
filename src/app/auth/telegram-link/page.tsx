"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { buildAuthHref } from "@/lib/post-auth-return";
import { isValidLinkCode } from "@/lib/telegram/link-code-format";

function TelegramLinkInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = (params.get("code") || "").trim().toLowerCase();
  const [status, setStatus] = useState<string>("loading");
  const [message, setMessage] = useState<string>("");
  const [username, setUsername] = useState<string | null>(null);

  const bind = useCallback(async () => {
    if (!isValidLinkCode(code)) {
      setStatus("invalid");
      setMessage("Некорректный код привязки. Запросите новую ссылку в боте.");
      return;
    }
    setStatus("binding");
    try {
      const res = await fetch("/api/auth/telegram/link-code", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        username?: string | null;
        alreadyLinked?: boolean;
        error?: string;
      };
      if (res.status === 401) {
        const returnTo = `/auth/telegram-link?code=${encodeURIComponent(code)}`;
        router.replace(buildAuthHref("/auth/user/login", returnTo));
        return;
      }
      if (!res.ok || !data.ok) {
        setStatus("error");
        setMessage(data.message || "Не удалось привязать Telegram.");
        return;
      }
      setUsername(data.username ?? null);
      setStatus("ok");
      setMessage(
        data.alreadyLinked
          ? "Telegram уже был привязан к этому аккаунту."
          : "Telegram успешно привязан. Можно вернуться в бота."
      );
    } catch {
      setStatus("error");
      setMessage("Не удалось привязать Telegram. Попробуйте ещё раз.");
    }
  }, [code, router]);

  useEffect(() => {
    void (async () => {
      if (!isValidLinkCode(code)) {
        setStatus("invalid");
        setMessage("Некорректный код привязки. Запросите новую ссылку в боте.");
        return;
      }
      try {
        const peek = await fetch(`/api/auth/telegram/link-code?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await peek.json().catch(() => ({}))) as {
          status?: string;
          telegramUsername?: string | null;
        };
        if (data.status === "expired" || data.status === "consumed" || data.status === "not_found") {
          setStatus(data.status || "error");
          setMessage(
            data.status === "expired"
              ? "Срок кода истёк. Запросите новую ссылку в боте."
              : data.status === "consumed"
                ? "Этот код уже использован."
                : "Код не найден. Запросите новую ссылку в боте."
          );
          return;
        }
        if (data.telegramUsername) setUsername(data.telegramUsername);
      } catch {
        /* continue to bind */
      }
      await bind();
    })();
  }, [bind, code]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold text-white">Привязка Telegram</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Telegram не используется для входа. Сначала войдите на сайт разрешённым способом — затем
        код из бота привяжет мессенджер к аккаунту.
      </p>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
        {status === "loading" || status === "binding" ? (
          <p className="text-sm text-[var(--muted)]">Привязываем…</p>
        ) : null}
        {message ? (
          <p
            className={`text-sm ${status === "ok" ? "text-emerald-200/90" : "text-red-300"}`}
          >
            {message}
            {status === "ok" && username ? (
              <>
                {" "}
                <span className="font-medium">@{username}</span>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/cabinet" className="btn-primary px-4 py-2 text-sm">
            В кабинет
          </Link>
          <Link href="/auth/user/login" className="btn-ghost px-4 py-2 text-sm">
            Войти на сайт
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function TelegramLinkPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg px-4 py-16 text-sm text-[var(--muted)]">Загрузка…</main>
      }
    >
      <TelegramLinkInner />
    </Suspense>
  );
}
