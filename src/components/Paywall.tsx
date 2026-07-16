"use client";

import { motion } from "framer-motion";
import { X, CreditCard, Smartphone, Loader2 } from "lucide-react";
import { useState } from "react";
import type { PaymentPlan } from "@/lib/yukassa";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { fetchPlatformFeatures } from "@/lib/usePlatformFeatures";

interface PaywallProps {
  sessionId: string;
  userName?: string;
  onClose: () => void;
  onUnlocked: () => void;
}

export default function Paywall({ sessionId, userName, onClose }: PaywallProps) {
  const [loading, setLoading] = useState<PaymentPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async (plan: PaymentPlan) => {
    setLoading(plan);
    setError(null);
    try {
      const features = await fetchPlatformFeatures();
      const payload: Record<string, unknown> = { sessionId, plan };
      const captchaErr = await attachRecaptchaToken(payload, "payments", features);
      if (captchaErr) {
        setError(captchaErr);
        setLoading(null);
        return;
      }

      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.confirmationUrl) {
        window.location.href = data.confirmationUrl;
        return;
      }
      setError(data.error ?? data.message ?? "Не удалось создать платёж. Попробуйте позже.");
      setLoading(null);
    } catch {
      setError("Ошибка соединения. Проверьте интернет и попробуйте снова.");
      setLoading(null);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,6,4,0.82)] p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <motion.div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[rgba(201,162,74,0.28)] bg-[#141210] shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Закрыть окно оплаты"
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-white/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(201,162,74,0.55)]"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-8">
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-[rgba(201,162,74,0.75)]">
            Продолжение сеанса
          </p>

          <h2 id="paywall-title" className="font-display mb-2 text-center text-2xl font-medium text-[#ede6da]">
            {userName ? `${userName}, открыть полный разбор` : "Открыть полный разбор"}
          </h2>
          <p className="mb-6 text-center text-sm leading-relaxed text-[rgba(237,230,218,0.55)]">
            Бесплатные вопросы использованы. Полный доступ раскроет 2-ю и 3-ю карту и смысл всего
            расклада.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mb-6 w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/45 transition-colors hover:border-white/20 hover:text-white"
          >
            Остаться с первой картой
          </button>

          <div className="space-y-3">
            <button
              onClick={() => handlePay("single")}
              disabled={loading !== null}
              className="group flex w-full items-center gap-4 rounded-xl border border-[rgba(201,162,74,0.28)] bg-[rgba(201,162,74,0.06)] p-4 text-left transition-colors hover:border-[rgba(201,162,74,0.5)] disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(201,162,74,0.25)] bg-[rgba(201,162,74,0.1)]">
                {loading === "single" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-aura-gold" />
                ) : (
                  <Smartphone className="h-6 w-6 text-aura-champagne" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-[#ede6da]">Детальный разбор</p>
                <p className="text-xs text-white/40">СБП · карты · ЮMoney</p>
              </div>
              <span className="font-display text-xl font-semibold text-aura-gold">за руны ᚢ</span>
            </button>

            <button
              onClick={() => handlePay("subscription")}
              disabled={loading !== null}
              className="group flex w-full items-center gap-4 rounded-xl border border-[rgba(201,162,74,0.4)] bg-[rgba(201,162,74,0.1)] p-4 text-left transition-colors hover:border-aura-gold disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-aura-gold/15">
                {loading === "subscription" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-aura-gold" />
                ) : (
                  <CreditCard className="h-6 w-6 text-aura-gold" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-[#ede6da]">Подписка Zovus+</p>
                <p className="text-xs text-white/40">Безлимит на месяц · все проводники</p>
              </div>
              <span className="font-display text-xl font-semibold text-aura-gold">Zovus+</span>
            </button>
          </div>

          {error && (
            <p role="alert" className="mb-4 mt-4 text-center text-sm text-red-300">
              {error}
            </p>
          )}

          <p className="mt-6 text-center text-xs text-white/30">
            Оплата через ЮKassa · Безопасное соединение
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
