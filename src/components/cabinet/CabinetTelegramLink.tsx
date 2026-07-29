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
    </section>
  );
}
