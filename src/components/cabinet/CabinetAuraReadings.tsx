"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";

import BodyPortal from "@/components/BodyPortal";
import AuraMap from "@/components/aura/AuraMap";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import {
  AURA_VERDICT_LABELS,
  type AuraSnapshot,
} from "@/lib/aura-constants";
import type { CabinetAuraReadingRow } from "@/lib/cabinet-data";

interface Props {
  readings: CabinetAuraReadingRow[];
  onDelete?: (row: CabinetAuraReadingRow) => void;
  deletingId?: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function snapshotOf(row: CabinetAuraReadingRow): AuraSnapshot | null {
  const s = row.contextData.snapshot;
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const candidate = s as Partial<AuraSnapshot>;
  if (!candidate.dominantColor || !Array.isArray(candidate.layers) || !Array.isArray(candidate.chakras)) {
    return null;
  }
  return candidate as AuraSnapshot;
}

/** Aura readings archive — colors, verdict and the full premium report. */
export default function CabinetAuraReadings({ readings, onDelete, deletingId = null }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const active = readings.find((r) => r.id === activeId) ?? null;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeId && !readings.some((r) => r.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, readings]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

  // Dialog semantics: Escape to close, body scroll lock, initial focus.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveId(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!readings.length) return null;

  return (
    <section className="space-y-3">
      <h3 className="font-display text-lg text-white/90">Аура по фото</h3>
      <ul className="space-y-2">
        {readings.map((row) => {
          const dominant = row.contextData.dominantColor;
          const verdict = row.contextData.verdict;
          const deleting = deletingId === row.id;
          return (
            <li key={row.id} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setActiveId(row.id)}
                className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-aura-gold/30 hover:bg-white/[0.05]"
              >
                {dominant && (
                  <span
                    className="aura-chakra-dot h-3.5 w-3.5"
                    style={{ backgroundColor: dominant.hex, color: dominant.hex }}
                  />
                )}
                <span className="flex-1">
                  <span className="block text-sm text-white/85">
                    {dominant ? `Аура: ${dominant.name}` : "Разбор ауры"}
                  </span>
                  <span className="block text-xs text-white/45">
                    {formatDate(row.createdAt)}
                    {verdict ? ` · ${AURA_VERDICT_LABELS[verdict]}` : ""}
                  </span>
                </span>
                {!row.paid && (
                  <span className="shrink-0 rounded-full border border-aura-gold/30 bg-aura-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-aura-gold/90">
                    Без разбора
                  </span>
                )}
              </button>
              {onDelete && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    if (confirmDeleteId === row.id) {
                      setConfirmDeleteId(null);
                      onDelete(row);
                    } else {
                      setConfirmDeleteId(row.id);
                    }
                  }}
                  className={`shrink-0 rounded-xl border px-3 text-xs transition disabled:opacity-50 ${
                    confirmDeleteId === row.id
                      ? "border-red-400/50 bg-red-500/15 text-red-200"
                      : "border-white/10 text-white/40 hover:border-red-400/30 hover:text-red-300"
                  }`}
                  aria-label={confirmDeleteId === row.id ? "Подтвердить удаление" : "Удалить ауру"}
                  title={confirmDeleteId === row.id ? "Нажмите ещё раз" : "Удалить"}
                >
                  {deleting ? (
                    "…"
                  ) : confirmDeleteId === row.id ? (
                    "Точно?"
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <BodyPortal>
        <AnimatePresence>
          {active && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
              onClick={() => setActiveId(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.25 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cabinet-aura-reading-title"
                className="photo-flow-dialog max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl sm:p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p
                      id="cabinet-aura-reading-title"
                      className="text-xs uppercase tracking-[0.2em] text-aura-gold/70"
                    >
                      {active.contextData.verdict
                        ? AURA_VERDICT_LABELS[active.contextData.verdict]
                        : "Разбор ауры"}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {formatDate(active.createdAt)}
                    </p>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="rounded-full border border-white/10 p-2 text-white/60 transition hover:text-white"
                    aria-label="Закрыть"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {(() => {
                  const snapshot = snapshotOf(active);
                  if (!snapshot) return null;
                  return (
                    <div className="mb-4">
                      <AuraMap snapshot={snapshot} veiled={!active.paid} />
                    </div>
                  );
                })()}

                {active.paid ? (
                  <PremiumReadingBody
                    content={active.contextData.report ?? active.contextData.interpretation ?? ""}
                    className="text-sm text-white/85"
                  />
                ) : (
                  <div className="space-y-4">
                    {active.contextData.teaser ? (
                      <p className="text-sm leading-relaxed text-white/80">
                        {active.contextData.teaser}
                      </p>
                    ) : null}
                    <Link
                      href="/aura"
                      className="btn-luxe btn-luxe--md btn-luxe--gold w-full justify-center"
                    >
                      Получить полный разбор
                    </Link>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </section>
  );
}
