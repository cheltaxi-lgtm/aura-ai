"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import BodyPortal from "@/components/BodyPortal";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import {
  AURA_VERDICT_LABELS,
  type AuraSnapshot,
} from "@/lib/aura-constants";
import type { CabinetAuraReadingRow } from "@/lib/cabinet-data";

interface Props {
  readings: CabinetAuraReadingRow[];
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
export default function CabinetAuraReadings({ readings }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = readings.find((r) => r.id === activeId) ?? null;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activeId && !readings.some((r) => r.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, readings]);

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
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setActiveId(row.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-aura-gold/30 hover:bg-white/[0.05]"
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
              </button>
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

                {active.contextData.dominantColor && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {[active.contextData.dominantColor, ...(active.contextData.secondaryColors ?? [])].map(
                      (color) => (
                        <span key={color.key} className="aura-color-chip">
                          <span
                            className="aura-color-chip__dot"
                            style={{ backgroundColor: color.hex, color: color.hex }}
                          />
                          {color.name}
                        </span>
                      )
                    )}
                  </div>
                )}

                {(() => {
                  const snapshot = snapshotOf(active);
                  if (!snapshot) return null;
                  return (
                    <div className="mb-4 grid gap-1 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-medium text-white/50">Слои поля</p>
                        {snapshot.layers.map((layer) => (
                          <div key={layer.key} className="aura-layer-row">
                            <span className="aura-row__name">{layer.name}</span>
                            <span className="aura-row__state">{layer.state}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-medium text-white/50">Чакры</p>
                        {snapshot.chakras.map((chakra) => (
                          <div key={chakra.key} className="aura-chakra-row">
                            <span
                              className="aura-chakra-dot"
                              style={{ backgroundColor: chakra.color, color: chakra.color }}
                            />
                            <span className="aura-row__name">{chakra.name}</span>
                            <span className="aura-row__state">
                              {chakra.openness === "open"
                                ? "открыта"
                                : chakra.openness === "blocked"
                                  ? "закрыта"
                                  : "в балансе"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <PremiumReadingBody
                  content={active.contextData.report ?? active.contextData.interpretation ?? ""}
                  className="text-sm text-white/85"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </section>
  );
}
