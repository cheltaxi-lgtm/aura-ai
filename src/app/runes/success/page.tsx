"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import {
  clearPendingRunePurchase,
  readPendingRunePaymentId,
  RUNE_BALANCE_BEFORE_KEY,
} from "@/lib/rune-purchase-client";

const LAST_MASTER_KEY = "aura_last_master";
const PENDING_READING_KEY = "aura_pending_reading";

export default function RunePurchaseSuccessPage() {
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [status, setStatus] = useState<"polling" | "ready" | "timeout">("polling");

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

    const expectedRaw = localStorage.getItem(RUNE_BALANCE_BEFORE_KEY);
    const expected = expectedRaw !== null ? Number(expectedRaw) : null;
    const pendingPaymentId = readPendingRunePaymentId(new URLSearchParams(window.location.search));
    let attempts = 0;
    const maxAttempts = 20;

    const markReady = (balance: number) => {
      emitRuneBalanceUpdate(balance);
      setStatus("ready");
      clearPendingRunePurchase();
      window.setTimeout(() => {
        window.location.href = href;
      }, 1200);
    };

    const poll = async () => {
      try {
        const confirmRes = await fetch("/api/runes/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingPaymentId ? { paymentId: pendingPaymentId } : {}),
        });
        if (confirmRes.ok) {
          const confirmData = await confirmRes.json();
          if (typeof confirmData.balance === "number") {
            if (confirmData.credited || confirmData.alreadyCredited || confirmData.status === "already_credited") {
              markReady(confirmData.balance);
              return;
            }
          }
        }

        const params =
          expected !== null && Number.isFinite(expected)
            ? `?expected=${encodeURIComponent(String(expected))}`
            : "";
        const res = await fetch(`/api/runes/balance${params}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.balance === "number") {
            if (!data.pending || (expected !== null && data.balance > expected)) {
              markReady(data.balance);
              return;
            }
          }
        }
      } catch {
        /* retry */
      }

      attempts += 1;
      if (attempts >= maxAttempts) {
        setStatus("timeout");
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
        <h1 className="font-display mb-2 text-2xl font-bold text-white">
          {status === "timeout" ? "Ожидаем подтверждение" : "Руны получены!"}
        </h1>
        <p className="mb-6 text-sm text-gray-400">
          {status === "polling"
            ? "Подтверждаем оплату и обновляем баланс…"
            : status === "timeout"
              ? "Оплата обрабатывается дольше обычного. Обновите страницу через минуту — руны начислятся автоматически."
              : "Баланс пополнен. Сейчас вернём вас к мастеру."}
        </p>
        <Link
          href={redirectTo ?? "/"}
          className="btn-luxe btn-luxe--md btn-luxe--gold"
        >
          Вернуться к мастеру →
        </Link>
      </div>
    </div>
  );
}
