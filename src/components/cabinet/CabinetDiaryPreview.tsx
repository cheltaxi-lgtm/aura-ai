"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Trash2 } from "lucide-react";
import { formatShortDate, sanitizeCabinetDisplayText, truncate } from "@/lib/cabinet-utils";
import type { CabinetDiaryPreview } from "@/lib/cabinet-data";

interface Props {
  entries: CabinetDiaryPreview[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
  hideTitle?: boolean;
}

export default function CabinetDiaryPreview({
  entries,
  onDelete,
  deletingId = null,
  hideTitle = false,
}: Props) {
  return (
    <section id="cabinet-diary" className="space-y-4">
      <div className={`flex items-center gap-3 ${hideTitle ? "justify-end" : "justify-between"}`}>
        {!hideTitle ? (
          <h2 className="text-lg font-semibold text-white">Дневник судьбы</h2>
        ) : null}
        <Link href="/diary" className="cabinet-btn cabinet-btn--secondary shrink-0">
          <span>Все записи</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="cabinet-empty-state">
          Дневник заполняется автоматически после каждого сеанса.
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="cabinet-diary-card"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="cabinet-diary-card__date">🕯️ {formatShortDate(e.createdAt)}</span>
                {onDelete ? (
                  <button
                    type="button"
                    disabled={deletingId === e.id}
                    onClick={() => onDelete(e.id)}
                    className="cabinet-diary-card__delete"
                    aria-label="Удалить запись"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="cabinet-diary-card__text">
                {truncate(sanitizeCabinetDisplayText(e.entryText), 120)}
              </p>
              <Link href="/diary" className="cabinet-btn cabinet-btn--primary mt-4">
                Читать полностью
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CabinetDiaryPreviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <div className="h-6 w-36 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-24 animate-pulse rounded bg-white/10" />
      </div>
      <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
