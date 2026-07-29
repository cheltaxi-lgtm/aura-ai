"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  linked: boolean;
  telegramUserId?: string;
  username?: string | null;
};

function botUsername(): string {
  return (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "zovus_card_bot").trim();
}

/**
 * Post-auth Telegram bind only. Identity is never confirmed by Telegram Login Widget.
 * User gets a one-time link code from the bot after Russian-allowed site auth.
 */
export default function CabinetTelegramLink() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/telegram/status", { credentials: "include" });
      if (!res.ok) {
        setStatus({ linked: false });
        return;
      }
      setStatus((await res.json()) as Status);
    } catch {
      setStatus({ linked: false });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unlink = useCallback(async () => {
    if (busy) return;
    const label = status?.username ? `@${status.username}` : "этот Telegram";
    if (
      !window.confirm(
        `Отвязать ${label} от аккаунта Zovus?\n\nВход на сайт не изменится. Бот перестанет видеть кабинет, пока не привяжете снова.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/telegram/unlink", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.message || "Не удалось отвязать Telegram.");
        return;
      }
      setNotice(data.message || "Telegram отвязан.");
      setStatus({ linked: false });
    } catch {
      setError("Не удалось отвязать Telegram. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }, [busy, status?.username]);

  const botLink = `https://t.me/${botUsername()}?start=link`;

  return (
    <section
      id="cabinet-telegram-link"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3"
    >
      <div>
        <h2 className="text-base font-semibold text-white">Telegram</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Telegram — канал уведомлений и бота, не способ входа. Привязка возможна только после
          авторизации на сайте (email, Яндекс или VK).
        </p>
      </div>

      {status?.linked ? (
        <div className="space-y-3">
          <p className="text-sm text-emerald-200/90">
            Привязан
            {status.username ? (
              <>
                : <span className="font-medium">@{status.username}</span>
              </>
            ) : status.telegramUserId ? (
              <> (id {status.telegramUserId})</>
            ) : null}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void unlink()}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {busy ? "Отвязываем…" : "Отвязать Telegram"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
            <li>Откройте бота Zovus</li>
            <li>Нажмите «Привязать аккаунт» или отправьте /start link</li>
            <li>Перейдите по ссылке из бота (вы уже вошли на сайт)</li>
          </ol>
          <a
            href={botLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-[#2AABEE]/45 bg-[#2AABEE]/15 px-4 py-3 text-sm font-medium text-white transition hover:bg-[#2AABEE]/25"
          >
            Открыть бота для привязки
          </a>
        </div>
      )}

      {notice ? <p className="text-sm text-emerald-200/90">{notice}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
