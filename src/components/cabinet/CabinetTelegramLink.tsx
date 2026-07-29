"use client";

import { useCallback, useEffect, useState } from "react";
import TelegramBridgeButton from "@/components/auth/TelegramBridgeButton";

type Status = {
  linked: boolean;
  telegramUserId?: string;
  username?: string | null;
};

export default function CabinetTelegramLink() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section
      id="cabinet-telegram-link"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3"
    >
      <div>
        <h2 className="text-base font-semibold text-white">Привязка Telegram</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Один аккаунт на сайте и в боте: история, руны и расклады общие. Нажмите кнопку — откроется
          Telegram, подтвердите привязку и вернитесь сюда.
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
        <TelegramBridgeButton
          purpose="link"
          onSuccess={async (result) => {
            setError(null);
            await load();
            if (result.username) {
              setStatus({ linked: true, username: result.username });
            }
          }}
        />
      )}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
