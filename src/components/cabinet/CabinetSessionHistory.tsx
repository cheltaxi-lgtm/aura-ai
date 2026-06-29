"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Star, Trash2 } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import { MasterAvatarInline } from "@/components/MasterAvatar";
import {
  formatCabinetDate,
  formatCabinetPredictionPreview,
  masterDisplay,
  moodEmoji,
  outcomeRatingLabel,
  sessionMastersFromList,
  truncate,
} from "@/lib/cabinet-utils";
import type { CabinetSessionRow } from "@/lib/cabinet-data";

interface Props {
  sessions: CabinetSessionRow[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRate: (sessionId: string, rating: 1 | 2 | 3) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
  deletingId?: string | null;
  hideTitle?: boolean;
}

function RateModal({
  open,
  onClose,
  onSelect,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (r: 1 | 2 | 3) => void;
  submitting: boolean;
}) {
  if (!open) return null;
  return (
    <BodyPortal active={open}>
      <div
        className="app-modal-overlay fixed inset-0 z-[4990] flex items-end justify-center bg-black/70 p-4 sm:items-center pointer-events-auto"
        onClick={onClose}
        role="presentation"
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl"
        >
        <h3 className="text-lg font-semibold text-white">Сбылось ли предсказание?</h3>
        <div className="mt-4 flex flex-col gap-2">
          {(
            [
              [1, "⭐ Да, точно"],
              [2, "🌓 Частично"],
              [3, "❌ Нет"],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              disabled={submitting}
              onClick={() => onSelect(val)}
              className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition hover:border-amber-500/40 hover:bg-amber-950/20 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-[44px] w-full text-sm text-white/50"
        >
          Отмена
        </button>
      </motion.div>
      </div>
    </BodyPortal>
  );
}

function SessionCard({
  session,
  index,
  onRateClick,
  onDelete,
  deleting,
}: {
  session: CabinetSessionRow;
  index: number;
  onRateClick: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const master = masterDisplay(session.characterKey);
  const predictionPreview = session.prediction
    ? formatCabinetPredictionPreview(session.prediction)
    : "";

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="cabinet-session-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <MasterAvatarInline masterId={session.characterKey} masterName={master.name} size="sm" />
          <div>
            <p className="font-semibold text-white">
              {master.emoji} {master.name}
            </p>
            <p className="text-xs text-white/40">{formatCabinetDate(session.createdAt)}</p>
          </div>
        </div>
        {session.outcomeRating != null && (
          <span className="text-xs text-amber-400">{outcomeRatingLabel(session.outcomeRating)}</span>
        )}
      </div>

      {session.topicSummary && (
        <p className="mt-4 text-sm text-white/80">
          <span className="text-white/40">Тема: </span>
          {truncate(session.topicSummary, 60)}
        </p>
      )}

      {session.keyCards.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-white/40">Карты</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {session.keyCards.map((card) => (
              <span key={card} className="cabinet-card-badge">
                {card}
              </span>
            ))}
          </div>
        </div>
      )}

      {predictionPreview ? (
        <div className="mt-4">
          <p className="text-xs text-white/40">Предсказание</p>
          <p className="cabinet-session-card__prediction">{predictionPreview}</p>
        </div>
      ) : null}

      {session.mood && (
        <p className="mt-3 text-sm text-white/60">
          Настроение: {moodEmoji(session.mood)} {session.mood}
        </p>
      )}

      <div className="cabinet-session-card__actions">
        {session.outcomeRating == null && (
          <button
            type="button"
            onClick={() => onRateClick(session.id)}
            className="cabinet-btn cabinet-btn--secondary"
          >
            <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Оценить исход
          </button>
        )}
        <Link
          href={
            session.sessionId
              ? `/?master=${encodeURIComponent(session.characterKey)}&resume=chat&sessionId=${encodeURIComponent(session.sessionId)}`
              : `/?master=${encodeURIComponent(session.characterKey)}&resume=chat`
          }
          className="cabinet-btn cabinet-btn--primary"
        >
          Продолжить чат
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </Link>
        <button
          type="button"
          disabled={deleting}
          onClick={() => onDelete(session.id)}
          className="cabinet-btn cabinet-btn--danger"
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {deleting ? "Удаление…" : "Удалить"}
        </button>
      </div>
    </motion.article>
  );
}

export default function CabinetSessionHistory({
  sessions,
  hasMore,
  loadingMore,
  onLoadMore,
  onRate,
  onDelete,
  deletingId = null,
  hideTitle = false,
}: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [rateTarget, setRateTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const masters = useMemo(() => sessionMastersFromList(sessions), [sessions]);

  const filtered = useMemo(
    () => (filter === "all" ? sessions : sessions.filter((s) => s.characterKey === filter)),
    [sessions, filter]
  );

  const handleRate = async (rating: 1 | 2 | 3) => {
    if (!rateTarget) return;
    setSubmitting(true);
    try {
      await onRate(rateTarget, rating);
      setRateTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="cabinet-history" className="space-y-4">
      {!hideTitle ? (
        <h2 className="text-lg font-semibold text-white">История сеансов</h2>
      ) : null}

      {sessions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`cabinet-filter-pill ${filter === "all" ? "cabinet-filter-pill--active" : ""}`}
          >
            Все
          </button>
          {masters.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setFilter(m.id)}
              className={`cabinet-filter-pill ${filter === m.id ? "cabinet-filter-pill--active" : ""}`}
            >
              {m.emoji} {m.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="cabinet-empty-state">
          <p className="text-white/60">
            Твоя история сеансов пуста.
            <br />
            Начни первый сеанс — и всё что покажут символы останется здесь навсегда.
          </p>
          <Link href="/" className="cabinet-btn cabinet-btn--primary mt-6">
            Начать первый сеанс
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((s, i) => (
              <SessionCard
                key={s.id}
                session={s}
                index={i}
                onRateClick={setRateTarget}
                onDelete={onDelete}
                deleting={deletingId === s.id}
              />
            ))}
          </AnimatePresence>
          {hasMore && filter === "all" && (
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="cabinet-btn cabinet-btn--secondary w-full disabled:opacity-50"
            >
              {loadingMore ? "Загрузка…" : "Загрузить ещё"}
            </button>
          )}
        </div>
      )}

      <RateModal
        open={rateTarget != null}
        onClose={() => setRateTarget(null)}
        onSelect={handleRate}
        submitting={submitting}
      />
    </section>
  );
}

export function CabinetSessionHistorySkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded bg-white/10" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}
