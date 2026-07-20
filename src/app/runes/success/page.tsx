"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { emitRuneBalanceUpdate } from "@/components/RuneBalance";
import {
  clearPendingRunePurchase,
  hasFiredRunePurchaseGoal,
  markRunePurchaseGoalFired,
  readPendingRunePaymentId,
  RUNE_BALANCE_BEFORE_KEY,
} from "@/lib/rune-purchase-client";
import { trackPaymentCancelled, trackRunePurchase } from "@/lib/seo/metrika";
import { pushEcommercePurchase } from "@/lib/seo/ecommerce";

const LAST_MASTER_KEY = "aura_last_master";
const PENDING_READING_KEY = "aura_pending_reading";

async function firePurchaseAnalytics(paymentId: string | null): Promise<void> {
  if (!paymentId || hasFiredRunePurchaseGoal(paymentId)) return;
  try {
    const confirmRes = await fetch("/api/runes/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    if (!confirmRes.ok) return;
    const confirmData = await confirmRes.json();
    if (typeof confirmData.amountRub !== "number") return;
    trackRunePurchase(confirmData.amountRub, confirmData.packageId);
    pushEcommercePurchase({
      paymentId,
      amountRub: confirmData.amountRub,
      product: {
        id: confirmData.packageId ?? "custom",
        name: confirmData.packageName ?? confirmData.packageId ?? "Пакет рун",
        price: confirmData.amountRub,
        category: "runes",
      },
    });
    markRunePurchaseGoalFired(paymentId);
  } catch {
    /* analytics optional */
  }
}

export default function RunePurchaseSuccessPage() {
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [status, setStatus] = useState<"polling" | "ready" | "timeout" | "cancelled">("polling");

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
    let cancelledTracked = false;

    const markReady = async (balance: number) => {
      await firePurchaseAnalytics(pendingPaymentId);
      emitRuneBalanceUpdate(balance);
      setStatus("ready");
      clearPendingRunePurchase();
      window.setTimeout(() => {
        window.location.href = href;
      }, 1200);
    };

    const markCancelled = () => {
      if (!cancelledTracked) {
        cancelledTracked = true;
        trackPaymentCancelled("runes_success_return");
      }
      clearPendingRunePurchase();
      setStatus("cancelled");
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
          if (confirmData.cancelled || confirmData.status === "cancelled") {
            markCancelled();
            return;
          }
          if (typeof confirmData.balance === "number") {
            if (confirmData.credited || confirmData.alreadyCredited || confirmData.status === "already_credited") {
              const goalPaymentId =
                typeof confirmData.paymentId === "string" ? confirmData.paymentId : pendingPaymentId;
              if (
                goalPaymentId &&
                typeof confirmData.amountRub === "number" &&
                !hasFiredRunePurchaseGoal(goalPaymentId)
              ) {
                trackRunePurchase(confirmData.amountRub, confirmData.packageId);
                pushEcommercePurchase({
                  paymentId: goalPaymentId,
                  amountRub: confirmData.amountRub,
                  product: {
                    id: confirmData.packageId ?? "custom",
                    name: confirmData.packageName ?? confirmData.packageId ?? "Пакет рун",
                    price: confirmData.amountRub,
                    category: "runes",
                  },
                });
                markRunePurchaseGoalFired(goalPaymentId);
              }
              await markReady(confirmData.balance);
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
              await markReady(data.balance);
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

  const title =
    status === "cancelled"
      ? "Оплата не завершена"
      : status === "timeout"
        ? "Ожидаем подтверждение"
        : "Руны получены!";

  const message =
    status === "polling"
      ? "Подтверждаем оплату и обновляем баланс…"
      : status === "cancelled"
        ? "Платёж отменён или не был завершён. Вы можете вернуться и попробовать снова — баланс не изменился."
        : status === "timeout"
          ? "Оплата обрабатывается дольше обычного. Обновите страницу через минуту — руны начислятся автоматически."
          : "Баланс пополнен. Сейчас вернём вас к мастеру.";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-sm text-center">
        <div className="mb-4 text-6xl">ᚢ</div>
        <h1 className="font-display mb-2 text-2xl font-bold text-white">{title}</h1>
        <p className="mb-6 text-sm text-gray-400">{message}</p>
        <Link href={redirectTo ?? "/"} className="btn-luxe btn-luxe--md btn-luxe--gold">
          {status === "cancelled" ? "Вернуться и попробовать снова →" : "Вернуться к мастеру →"}
        </Link>
      </div>
    </div>
  );
}
