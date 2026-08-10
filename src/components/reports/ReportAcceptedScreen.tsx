"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Bell, Check, Mail, Send, ShieldCheck, Sparkles } from "lucide-react";

import type { AcceptedAsyncReport } from "@/lib/client/wait-for-async-job";

type Channels = {
  inApp: { available: boolean };
  email: { available: boolean; enabled: boolean; masked: string | null };
  telegram: { linked: boolean; enabled: boolean; username: string | null };
};

function formatEta(eta: { min: number; max: number } | null | undefined): string {
  if (!eta) return "несколько минут";
  const minMin = Math.max(1, Math.round(eta.min / 60));
  const maxMin = Math.max(minMin, Math.round(eta.max / 60));
  if (maxMin < 2) return "около минуты";
  return `${minMin}–${maxMin} минут`;
}

const STEPS = [
  { title: "Персональный расчёт", text: "Не шаблон: разбор строится по вашим данным в несколько проходов." },
  { title: "Проверка качества", text: "Готовый текст проходит контроль полноты перед отправкой." },
  { title: "Уведомление", text: "Как только отчёт готов — сообщим. Ссылка постоянная." },
];

/**
 * Premium «Отчёт принят» — replaces the blocking wait for heavy reports when
 * REPORT_BACKGROUND_DELIVERY_ENABLED is on. The user may leave immediately.
 */
export default function ReportAcceptedScreen({
  accepted,
  onStay,
}: {
  accepted: AcceptedAsyncReport;
  /** Switch back to the classic blocking wait on the same page. */
  onStay?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [channels, setChannels] = useState<Channels | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/notification-channels", {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setChannels(data as Channels);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const title = accepted.productTitle ?? "Отчёт";
  const destination = accepted.destination ?? "/cabinet";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto w-full max-w-lg rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 sm:p-8"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10">
          <Check className="h-5 w-5 text-emerald-300" />
        </span>
        <div>
          <p className="text-lg font-semibold text-white">Отчёт принят в работу</p>
          <p className="text-sm text-white/60">{title}</p>
        </div>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-white/75">
        Обычно это занимает <span className="text-white">{formatEta(accepted.etaRangeSec)}</span>.
        Это сложный персональный расчёт, а не шаблон — поэтому мы не держим вас на экране
        ожидания.
      </p>

      <div className="mt-5 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-200/25 bg-amber-300/10 text-[11px] font-semibold text-amber-200">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-white/85">{step.title}</p>
              <p className="text-xs leading-relaxed text-white/50">{step.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-white/40">
          Куда придёт уведомление
        </p>
        <ul className="mt-2 space-y-2 text-sm text-white/75">
          <li className="flex items-center gap-2.5">
            <Bell className="h-4 w-4 text-amber-200/80" />
            <span>В приложении — колокольчик вверху экрана</span>
            <Check className="h-3.5 w-3.5 text-emerald-300" />
          </li>
          <li className="flex items-center gap-2.5">
            <Mail className="h-4 w-4 text-amber-200/80" />
            {channels?.email.available && channels.email.enabled ? (
              <>
                <span>На почту {channels.email.masked ?? ""}</span>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              </>
            ) : (
              <span className="text-white/45">На почту — выключено в настройках кабинета</span>
            )}
          </li>
          <li className="flex items-center gap-2.5">
            <Send className="h-4 w-4 text-amber-200/80" />
            {channels?.telegram.linked && channels.telegram.enabled ? (
              <>
                <span>
                  В Telegram{channels.telegram.username ? ` (@${channels.telegram.username})` : ""}
                </span>
                <Check className="h-3.5 w-3.5 text-emerald-300" />
              </>
            ) : (
              <span className="text-white/45">
                В Telegram — {channels?.telegram.linked ? "выключено в настройках" : "не подключён"}
              </span>
            )}
          </li>
        </ul>
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-amber-200/15 bg-amber-300/[0.06] p-4">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
        <p className="text-xs leading-relaxed text-amber-100/80">
          Руны списаны один раз. Если расчёт не завершится, руны вернутся на баланс
          автоматически — повторного списания не будет ни при каком сценарии.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Link
          href={destination}
          className="flex-1 rounded-2xl bg-gradient-to-r from-amber-200 to-amber-400 px-5 py-3 text-center text-sm font-semibold text-[#241a08] transition hover:brightness-105"
        >
          Перейти в кабинет
        </Link>
        {onStay ? (
          <button
            type="button"
            onClick={onStay}
            className="flex-1 rounded-2xl border border-white/15 px-5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/5"
          >
            Дождаться здесь
          </button>
        ) : null}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/35">
        <Sparkles className="h-3 w-3" />
        Можно закрыть страницу — отчёт никуда не денется
      </p>
    </motion.div>
  );
}
