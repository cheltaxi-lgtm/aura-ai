"use client";

import { useCallback, useEffect, useState } from "react";
import TelegramLoginButton, {
  type TelegramWidgetUser,
} from "@/components/auth/TelegramLoginButton";

type Status = {
  linked: boolean;
  telegramUserId?: string;
  username?: string | null;
};

export default function CabinetTelegramLink() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const onAuth = async (user: TelegramWidgetUser) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/telegram/link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.message || "Не удалось привязать Telegram.");
        return;
      }
      await load();
    } catch {
      setError("Не удалось привязать Telegram.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="cabinet-telegram-link"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-3"
    >
      <div>
        <h2 className="text-base font-semibold text-white">Telegram</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Привяжите Telegram, чтобы продолжать расклады из бота в этом аккаунте — на любом
          устройстве.
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
        <div className={busy ? "opacity-50 pointer-events-none" : undefined}>
          <TelegramLoginButton onAuth={(u) => void onAuth(u)} size="medium" />
        </div>
      )}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}
