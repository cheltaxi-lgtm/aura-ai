"use client";

import { motion } from "framer-motion";
import { X, Sparkles, CreditCard, Smartphone, Loader2 } from "lucide-react";
import { useState } from "react";
import type { PaymentPlan } from "@/lib/yukassa";

interface PaywallProps {
  sessionId: string;
  userName?: string;
  onClose: () => void;
  onUnlocked: () => void;
}

export default function Paywall({ sessionId, userName, onClose, onUnlocked }: PaywallProps) {
  const [loading, setLoading] = useState<PaymentPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async (plan: PaymentPlan) => {
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, plan }),
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-aura-purple/30 bg-aura-bg shadow-neon"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -left-20 -top-20 h-40 w-40 rounded-full bg-aura-purple/20 blur-[60px]" />

        <button
          onClick={onClose}
          aria-label="Закрыть окно оплаты"
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aura-purple"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-8">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-aura-gold/40 bg-aura-gold/10">
              <Sparkles className="h-8 w-8 text-aura-gold" />
            </div>
          </div>

          <h2 className="font-display mb-2 text-center text-2xl font-bold text-white">
            {userName ? `${userName}, мастер готов` : "Мастер готов"}
            <span className="mt-1 block text-lg text-aura-gold">раскрыть 2-ю и 3-ю карту</span>
          </h2>
          <p className="mb-6 text-center text-sm text-gray-400">
            Бесплатные вопросы использованы. Полный разбор откроет смысл всего расклада.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="mb-6 w-full rounded-xl border border-white/10 py-2.5 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
          >
            Продолжить с первой картой
          </button>

          <div className="space-y-4">
            <button
              onClick={() => handlePay("single")}
              disabled={loading !== null}
              className="group flex w-full items-center gap-4 rounded-xl border border-aura-purple/40 bg-aura-purple/10 p-4 text-left hover:border-aura-purple hover:shadow-neon disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-aura-purple/20">
                {loading === "single" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-aura-neon" />
                ) : (
                  <Smartphone className="h-6 w-6 text-aura-neon" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">Детальный разбор</p>
                <p className="text-xs text-gray-400">СБП · карты · ЮMoney</p>
              </div>
              <span className="font-display text-xl font-bold text-aura-gold">199 ₽</span>
            </button>

            <button
              onClick={() => handlePay("subscription")}
              disabled={loading !== null}
              className="group flex w-full items-center gap-4 rounded-xl border border-aura-gold/40 bg-aura-gold/5 p-4 text-left hover:border-aura-gold hover:shadow-neon-gold disabled:opacity-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-aura-gold/20">
                {loading === "subscription" ? (
                  <Loader2 className="h-6 w-6 animate-spin text-aura-gold" />
                ) : (
                  <CreditCard className="h-6 w-6 text-aura-gold" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-white">Подписка Zovus+</p>
                <p className="text-xs text-gray-400">Безлимит на месяц · все наставники</p>
              </div>
              <span className="font-display text-xl font-bold text-aura-gold">590 ₽</span>
            </button>
          </div>

          {error && (
            <p role="alert" className="mb-4 text-center text-sm text-red-400">
              {error}
            </p>
          )}

          <p className="mt-6 text-center text-xs text-gray-600">
            Оплата через ЮKassa · Безопасное соединение
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
