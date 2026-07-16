"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import BrandMark from "@/components/BrandMark";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { RefreshCw, Sparkles } from "lucide-react";

interface AppBootstrapScreenProps {
  title?: string;
  subtitle?: string;
  hint?: string;
  showRetryAfterMs?: number;
  embedded?: boolean;
}

export default function AppBootstrapScreen({
  title = "Настраиваем канал",
  subtitle = "Подключаем мастеров, колоды и ваш астральный профиль",
  hint = "Это займёт несколько секунд",
  showRetryAfterMs = 12_000,
  embedded = false,
}: AppBootstrapScreenProps) {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowRetry(true), showRetryAfterMs);
    return () => window.clearTimeout(timer);
  }, [showRetryAfterMs]);

  return (
    <div
      className={`bootstrap-screen flex flex-col items-center justify-center px-6 py-16 ${
        embedded ? "pointer-events-none min-h-0 py-8" : "min-h-screen"
      }`}
    >
      <motion.header
        className="bootstrap-screen__brand mb-10 text-center"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-3 inline-flex items-center gap-2">
          <BrandMark size={28} />
          <span className="font-display text-3xl font-semibold tracking-[0.16em] text-[#ede6da]">
            {BRAND_NAME.toUpperCase()}
          </span>
        </div>
        <p className="text-xs uppercase tracking-[0.35em] text-aura-champagne/55">
          {BRAND_TAGLINE}
        </p>
      </motion.header>

      <motion.div
        className="bootstrap-screen__panel glass-panel w-full max-w-md px-8 py-10 text-center"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="bootstrap-screen__orb-wrap mx-auto mb-8" aria-hidden>
          <div className="bootstrap-screen__orb-ring bootstrap-screen__orb-ring--outer" />
          <div className="bootstrap-screen__orb-ring bootstrap-screen__orb-ring--inner" />
          <div className="bootstrap-screen__orb-core">
            <Sparkles className="h-5 w-5 text-aura-champagne" />
          </div>
        </div>

        <p className="font-display mb-2 text-xl font-semibold text-white md:text-2xl">
          {title}
        </p>
        <p className="mx-auto mb-6 max-w-xs text-sm leading-relaxed text-aura-ivory/65">
          {subtitle}
        </p>

        <div className="bootstrap-screen__progress mx-auto mb-4" aria-hidden>
          <span className="bootstrap-screen__progress-bar" />
        </div>

        <p className="text-xs text-gray-500">{hint}</p>

        {showRetry ? (
          <motion.div
            className="mt-6 border-t border-white/10 pt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <p className="mb-3 text-xs text-aura-champagne/70">
              Загрузка дольше обычного — сервер может обновляться
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-ghost pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 text-sm"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Обновить страницу
            </button>
          </motion.div>
        ) : null}
      </motion.div>

      <motion.p
        className="bootstrap-screen__footer mt-8 max-w-sm text-center text-[11px] leading-relaxed text-gray-600"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        Таро · руны · астрология · персональные мастера
      </motion.p>
    </div>
  );
}
