"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";

import { useActiveReports, type ActiveReportItem } from "@/hooks/useActiveReports";

function etaLabel(item: ActiveReportItem): string | null {
  if (!item.etaRangeSec) return null;
  const min = Math.max(1, Math.round(item.etaRangeSec.min / 60));
  const max = Math.max(min, Math.round(item.etaRangeSec.max / 60));
  return max < 2 ? "около минуты" : `обычно ${min}–${max} мин`;
}

function progressPct(item: ActiveReportItem): number | null {
  const done = item.progress?.done;
  const total = item.progress?.total;
  if (typeof done === "number" && typeof total === "number" && total > 0) {
    return Math.min(96, Math.max(4, Math.round((done / total) * 100)));
  }
  return null;
}

function ActiveRow({ item }: { item: ActiveReportItem }) {
  const pct = progressPct(item);
  const eta = etaLabel(item);
  const statusText =
    item.status === "pending"
      ? item.queuePosition && item.queuePosition > 1
        ? `В очереди — позиция ${item.queuePosition}`
        : "В очереди — скоро начнём"
      : item.progress?.label ??
        item.progress?.message ??
        "Идёт персональный расчёт";

  return (
    <div className="rounded-2xl border border-amber-200/15 bg-amber-300/[0.05] p-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-200 motion-reduce:animate-none" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">{item.productTitle}</p>
          <p className="mt-0.5 text-xs text-white/50">
            {statusText}
            {eta ? ` · ${eta}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <div
          className="h-full w-full origin-left rounded-full bg-gradient-to-r from-amber-200/70 to-amber-400/70 transition-transform duration-700"
          style={{ transform: `scaleX(${(pct ?? 18) / 100})` }}
        />
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-white/40">
        Можно закрыть страницу — пришлём уведомление. Повторного списания рун не будет.
      </p>
    </div>
  );
}

function TerminalRow({ item }: { item: ActiveReportItem }) {
  if (item.status === "completed") {
    return (
      <Link
        href={item.destination ?? "/cabinet"}
        className="flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-400/[0.07] p-4 transition hover:bg-emerald-400/[0.12]"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">{item.productTitle}</p>
          <p className="mt-0.5 text-xs text-emerald-200/70">Готов — открыть разбор</p>
        </div>
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-300/70" />
      </Link>
    );
  }

  const isRegen = item.status === "needs_regeneration";
  return (
    <div className="rounded-2xl border border-rose-300/15 bg-rose-400/[0.05] p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300/80" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">{item.productTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-white/50">
            {isRegen
              ? "Проходит дополнительную проверку качества — повторного списания не будет."
              : item.refunded
                ? "Не удалось завершить. Руны возвращены на баланс."
                : "Техническая сложность. Если расчёт не перезапустится сам, руны вернутся."}
          </p>
        </div>
        {!isRegen && item.destination ? (
          <Link
            href={item.destination}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 py-1.5 text-xs text-white/75 transition hover:bg-white/5"
          >
            <RefreshCcw className="h-3 w-3" />
            Открыть
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * «Ваши отчёты» — active heavy reports with live status plus recently
 * finished/failed ones. Renders nothing when there is nothing to say.
 */
export default function CabinetActiveReports() {
  const reduceMotion = useReducedMotion();
  const { reports, loading, dismissTerminal } = useActiveReports();

  if (loading || reports.length === 0) return null;

  const active = reports.filter(
    (r) => r.status === "pending" || r.status === "running"
  );
  const terminal = reports.filter(
    (r) => r.status !== "pending" && r.status !== "running"
  );

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <Clock3 className="h-4 w-4 text-amber-200/80" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Ваши отчёты
        </h2>
        {terminal.length > 0 ? (
          <button
            type="button"
            onClick={() => void dismissTerminal(terminal.map((r) => r.jobId))}
            className="ml-auto text-xs text-white/45 transition hover:text-white/75"
          >
            Очистить
          </button>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        <AnimatePresence initial={false}>
          {active.map((item) => (
            <motion.div
              key={item.jobId}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <ActiveRow item={item} />
            </motion.div>
          ))}
          {terminal.map((item) => (
            <motion.div
              key={item.jobId}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <TerminalRow item={item} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
