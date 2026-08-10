"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Loader2, X } from "lucide-react";

import { useActiveReports } from "@/hooks/useActiveReports";

/**
 * Global floating indicator: visible on any page while a heavy report is
 * being prepared (or has just finished). Collapsed pill → expandable list.
 *
 * Portaled to document.body: AppTopHeader uses backdrop-blur, which creates a
 * containing block for position:fixed descendants — without a portal the tray
 * sticks to the header bottom and peeks out behind the gold action pills.
 */
export default function ActiveReportsTray() {
  const reduceMotion = useReducedMotion();
  const { reports, active, dismissTerminal } = useActiveReports();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const ready = reports.filter((r) => r.status === "completed");
  const terminal = reports.filter(
    (r) =>
      r.status === "completed" ||
      r.status === "failed" ||
      r.status === "needs_regeneration"
  );
  if (!mounted || (active.length === 0 && ready.length === 0)) return null;

  const pillLabel =
    active.length > 0
      ? active.length === 1
        ? "Готовится разбор"
        : `Готовятся разборы · ${active.length}`
      : ready.length === 1
        ? "Отчёт готов"
        : `Готовы отчёты · ${ready.length}`;

  const handleClear = async () => {
    if (clearing || terminal.length === 0) return;
    setClearing(true);
    try {
      await dismissTerminal(terminal.map((r) => r.jobId));
      if (active.length === 0) setOpen(false);
    } finally {
      setClearing(false);
    }
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:justify-end sm:pr-6">
      <div className="pointer-events-auto w-full max-w-sm">
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="panel"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.22 }}
              className="mb-2 rounded-2xl border border-white/12 bg-[#171310]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  Ваши отчёты
                </p>
                <div className="flex items-center gap-1">
                  {terminal.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void handleClear()}
                      disabled={clearing}
                      className="rounded-full px-2.5 py-1 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white/85 disabled:opacity-50"
                    >
                      {clearing ? "…" : "Очистить"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-full p-1 text-white/50 transition hover:bg-white/10 hover:text-white/80"
                    aria-label="Свернуть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2.5">
                {active.map((item) => (
                  <div
                    key={item.jobId}
                    className="rounded-xl border border-amber-200/15 bg-amber-300/[0.06] p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-200 motion-reduce:animate-none" />
                      <p className="truncate text-sm text-white/85">{item.productTitle}</p>
                    </div>
                    <p className="mt-1 text-[11px] text-white/45">
                      {item.status === "pending"
                        ? item.queuePosition && item.queuePosition > 1
                          ? `В очереди — позиция ${item.queuePosition}`
                          : "В очереди"
                        : item.progress?.label ?? "Идёт расчёт"}
                      {" · "}пришлём уведомление
                    </p>
                  </div>
                ))}
                {ready.map((item) => (
                  <Link
                    key={item.jobId}
                    href={item.destination ?? "/cabinet"}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] p-3 transition hover:bg-emerald-400/[0.14]"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <p className="truncate text-sm text-white/90">{item.productTitle}</p>
                    <span className="ml-auto shrink-0 text-[11px] text-emerald-200/80">
                      Открыть
                    </span>
                  </Link>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => setOpen((v) => !v)}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full items-center justify-center gap-2.5 rounded-full border border-amber-200/25 bg-[#171310]/95 px-5 py-3 text-sm font-medium text-amber-100 shadow-xl shadow-black/40 backdrop-blur transition hover:border-amber-200/40"
        >
          {active.length > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          )}
          {pillLabel}
        </motion.button>
      </div>
    </div>,
    document.body
  );
}
