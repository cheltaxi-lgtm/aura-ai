"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";

const LAST_MASTER_KEY = "aura_last_master";
const PENDING_READING_KEY = "aura_pending_reading";
const BALANCE_BEFORE_KEY = "aura_runes_before_purchase";

export default function RunePurchaseSuccessPage() {
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [status, setStatus] = useState<"polling" | "ready">("polling");

  useEffect(() => {
    let masterId: string | null = null;

    try {
      const pendingRaw = localStorage.getItem(PENDING_READING_KEY);
      if (pendingRaw) {
        const pending = JSON.parse(pendingRaw) as { masterId?: string };
        masterId = pending.masterId ?? null;
      }
    } catch {
      masterId = null;
    }

    if (!masterId) {
      masterId = localStorage.getItem(LAST_MASTER_KEY);
    }

    const href = masterId ? `/?master=${encodeURIComponent(masterId)}` : "/";
    setRedirectTo(href);

    const expectedRaw = localStorage.getItem(BALANCE_BEFORE_KEY);
    const expected = expectedRaw !== null ? Number(expectedRaw) : null;
    let attempts = 0;
    const maxAttempts = 15;

    const poll = async () => {
      try {
        const params =
          expected !== null && Number.isFinite(expected)
            ? `?expected=${encodeURIComponent(String(expected))}`
            : "";
        const res = await fetch(`/api/runes/balance${params}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.balance === "number") {
            emitRuneBalanceUpdate(data.balance);
            if (!data.pending || (expected !== null && data.balance > expected)) {
              setStatus("ready");
              localStorage.removeItem(BALANCE_BEFORE_KEY);
              window.setTimeout(() => {
                window.location.href = href;
              }, 1200);
              return;
            }
          }
        }
      } catch {
        /* retry */
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        setStatus("ready");
        window.setTimeout(() => {
          window.location.href = href;
        }, 800);
      }
    };

    void poll();
    const interval = window.setInterval(poll, 2000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="mb-4 text-6xl">ᚢ</div>
        <h1 className="font-display mb-2 text-2xl font-bold text-white">Руны получены!</h1>
        <p className="mb-6 text-sm text-gray-400">
          {status === "polling"
            ? "Подтверждаем оплату и обновляем баланс…"
            : "Баланс пополнен. Сейчас вернём вас к мастеру."}
        </p>
        <Link
          href={redirectTo ?? "/"}
          className="inline-block rounded-xl bg-amber-500 px-6 py-3 font-bold text-black transition-colors hover:bg-amber-400"
        >
          Вернуться к мастеру →
        </Link>
      </div>
    </div>
  );
}
