"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X } from "lucide-react";

import BodyPortal from "@/components/BodyPortal";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import PalmInsightCards from "@/components/palm/PalmInsightCards";
import {
  PALM_HAND_LABELS,
  PALM_HAND_SHAPE_LABELS,
  PALM_VERDICT_LABELS,
  type PalmSnapshot,
} from "@/lib/palm-constants";
import type { CabinetPalmReadingRow } from "@/lib/cabinet-data";

interface Props {
  readings: CabinetPalmReadingRow[];
  onDelete?: (row: CabinetPalmReadingRow) => void;
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

function snapshotOf(row: CabinetPalmReadingRow): PalmSnapshot | null {
  const s = row.contextData.snapshot;
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const candidate = s as Partial<PalmSnapshot>;
  if (candidate.handDetected !== true || !candidate.handShape || !candidate.whichHand) {
    return null;
  }
  return candidate as PalmSnapshot;
}

export default function CabinetPalmReadings({ readings, onDelete, deletingId = null }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const active = readings.find((r) => r.id === activeId) ?? null;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeId && !readings.some((r) => r.id === activeId)) setActiveId(null);
  }, [activeId, readings]);

  useEffect(() => {
    if (!confirmDeleteId) return;
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteId]);

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
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg text-white">Гадание по ладони</h3>
        <Link href="/gadanie-po-ladoni" className="text-sm text-aura-gold hover:underline">
          Новый снимок
        </Link>
      </div>
      <ul className="space-y-2">
        {readings.map((row) => {
          const snap = snapshotOf(row);
          const shape = snap?.handShape ?? row.contextData.handShape;
          const verdict = snap?.verdict ?? row.contextData.verdict;
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setActiveId(row.id)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left"
              >
                <span>
                  <span className="block text-sm text-white">
                    {shape ? PALM_HAND_SHAPE_LABELS[shape] : "Ладонь"}
                    {verdict ? ` · ${PALM_VERDICT_LABELS[verdict]}` : ""}
                  </span>
                  <span className="text-xs text-white/50">{formatDate(row.createdAt)}</span>
                </span>
                <span className="text-xs text-white/40">{row.paid ? "Отчёт" : "Тизер"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {active && (
          <BodyPortal>
            <motion.div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveId(null)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="cabinet-palm-title"
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#121018] p-5"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h4 id="cabinet-palm-title" className="font-display text-lg text-white">
                    {active.paid ? "Разбор ладони" : "Тизер ладони"}
                  </h4>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="rounded-full p-2 text-white/60 hover:text-white"
                    aria-label="Закрыть"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="mt-2 text-center text-sm text-white/55">
                  {active.contextData.whichHand
                    ? PALM_HAND_LABELS[active.contextData.whichHand]
                    : ""}
                </p>
                <p className="mb-4 text-center text-sm text-white/55">
                  Фото не хранится — остаётся результат анализа.
                </p>
                {active.paid && snapshotOf(active)?.majorLines ? (
                  <PalmInsightCards snapshot={snapshotOf(active)!} />
                ) : null}
                {active.contextData.report ? (
                  <PremiumReadingBody content={active.contextData.report} className="text-sm text-white/85" />
                ) : (
                  <p className="mt-4 text-white/70">{active.contextData.teaser}</p>
                )}
                {onDelete && (
                  <button
                    type="button"
                    disabled={deletingId === active.id}
                    onClick={() => {
                      if (confirmDeleteId === active.id) {
                        onDelete(active);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(active.id);
                      }
                    }}
                    className="mt-4 inline-flex items-center gap-2 text-sm text-rose-300/80"
                  >
                    <Trash2 className="h-4 w-4" />
                    {confirmDeleteId === active.id ? "Подтвердить удаление" : "Удалить"}
                  </button>
                )}
              </motion.div>
            </motion.div>
          </BodyPortal>
        )}
      </AnimatePresence>
    </section>
  );
}
