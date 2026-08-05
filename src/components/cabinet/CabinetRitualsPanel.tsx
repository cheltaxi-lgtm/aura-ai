"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2, ArrowRight } from "lucide-react";
import {
  MASTER_VISUAL,
  RITUAL_TYPE_KEYS,
  RITUAL_VISUAL,
  RITUAL_STATUS_VISUAL,
  isRitualInProgress,
  needsReview,
  type RitualMasterKey,
  type RitualType,
} from "@/lib/ritual-config";
import type { CabinetRitualStats } from "@/lib/ritual-service";
import type { RitualClientData } from "@/components/ritual/RitualCard";

type TypeFilter = "all" | RitualType;
type StatusFilter = "all" | "in_progress" | "completed" | "awaiting_review";

interface Props {
  onOpenRitual: (ritualId: string, characterKey: RitualMasterKey) => void;
  onNewRitual: (characterKey?: RitualMasterKey) => void;
  onRitualDeleted?: (ritualId: string) => void;
  onStatsLoaded?: (stats: CabinetRitualStats) => void;
}

function formatRitualDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function cardBorderStyle(ritual: RitualClientData): string {
  if (needsReview(ritual)) return "border-amber-400/50 bg-amber-950/10";
  if (ritual.status === "reviewed") return "border-blue-400/40 bg-blue-950/10";
  if (ritual.status === "completed") return "border-emerald-400/40 bg-emerald-950/10";
  if (isRitualInProgress(ritual.status)) return "border-aura-gold/40 bg-aura-gold/10";
  return "border-white/10 bg-black/20";
}

function statusEmoji(ritual: RitualClientData): string {
  if (needsReview(ritual)) return "⏳";
  if (ritual.status === "reviewed") return "✅";
  if (ritual.status === "completed") return "✨";
  return RITUAL_STATUS_VISUAL[ritual.status as keyof typeof RITUAL_STATUS_VISUAL]?.emoji ?? "🔮";
}

export default function CabinetRitualsPanel({
  onOpenRitual,
  onNewRitual,
  onRitualDeleted,
  onStatsLoaded,
}: Props) {
  const [rituals, setRituals] = useState<RitualClientData[]>([]);
  const [stats, setStats] = useState<CabinetRitualStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deletingRitualId, setDeletingRitualId] = useState<string | null>(null);
  const [showMasterPicker, setShowMasterPicker] = useState(false);

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch("/api/ritual/list", { credentials: "include" }),
        fetch("/api/ritual/cabinet-stats", { credentials: "include" }),
      ]);
      if (!listRes.ok) {
        setLoadError("Не удалось загрузить обряды. Попробуйте обновить страницу.");
        return;
      }
      const data = await listRes.json();
      setRituals(data.rituals ?? []);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const s = statsData.stats as CabinetRitualStats;
        setStats(s);
        onStatsLoaded?.(s);
      }
    } catch {
      setLoadError("Не удалось загрузить обряды. Попробуйте обновить страницу.");
    } finally {
      setLoading(false);
    }
  }, [onStatsLoaded]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    return rituals.filter((r) => {
      if (typeFilter !== "all" && r.ritualType !== typeFilter) return false;
      if (statusFilter === "in_progress" && !isRitualInProgress(r.status)) return false;
      if (statusFilter === "completed" && r.status !== "completed" && r.status !== "reviewed")
        return false;
      if (statusFilter === "awaiting_review" && !needsReview(r)) return false;
      return true;
    });
  }, [rituals, typeFilter, statusFilter]);

  const handleDeleteRitual = async (ritualId: string) => {
    const confirmed = window.confirm(
      "Удалить этот обряд безвозвратно? Карточка и ответы будут потеряны."
    );
    if (!confirmed) return;

    setDeletingRitualId(ritualId);
    try {
      const res = await fetch(`/api/ritual/${encodeURIComponent(ritualId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось удалить обряд");
      setRituals((prev) => prev.filter((r) => r.id !== ritualId));
      onRitualDeleted?.(ritualId);
      void fetchData();
    } catch {
      window.alert("Не удалось удалить обряд. Попробуйте позже.");
    } finally {
      setDeletingRitualId(null);
    }
  };

  const typeCounts = stats
    ? {
        love: stats.loveCount,
        money: stats.moneyCount,
        protection: stats.protectionCount,
        luck: stats.luckCount,
        release: stats.releaseCount,
        health: stats.healthCount,
        career: stats.careerCount,
      }
    : null;

  if (loading) {
    return <p className="text-center text-sm text-white/40">Загрузка обрядов…</p>;
  }

  if (loadError) {
    return (
      <section className="glass-panel p-4 text-center">
        <p className="text-sm text-red-200/90">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void fetchData();
          }}
          className="cabinet-btn cabinet-btn--secondary mt-4"
        >
          Повторить
        </button>
      </section>
    );
  }

  const newRitualButton = showMasterPicker ? (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {(Object.keys(MASTER_VISUAL) as RitualMasterKey[]).map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => {
            setShowMasterPicker(false);
            onNewRitual(key);
          }}
          className="cabinet-btn cabinet-btn--secondary"
        >
          {MASTER_VISUAL[key].emoji} {MASTER_VISUAL[key].name}
        </button>
      ))}
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setShowMasterPicker(true)}
      className="cabinet-btn cabinet-btn--primary"
    >
      {rituals.length > 0 ? "Заказать обряд" : "Заказать первый обряд"}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </button>
  );

  return (
    <section className="glass-panel p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-white">🕯 Мои обряды</h2>

          {stats && stats.total > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-3 text-sm">
                {RITUAL_TYPE_KEYS.map((key) => {
                  const count = typeCounts?.[key] ?? 0;
                  if (count === 0) return null;
                  const vis = RITUAL_VISUAL[key];
                  return (
                    <span key={key} style={{ color: vis.color }}>
                      {vis.emoji} ×{count}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-white/50">
                Всего: {stats.total} · Завершено: {stats.completed} · Знаки:{" "}
                {stats.signsNoted}
              </p>
            </div>
          ) : null}
        </div>
        {rituals.length > 0 ? <div className="shrink-0">{newRitualButton}</div> : null}
      </div>

      {rituals.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              Все
            </FilterChip>
            {RITUAL_TYPE_KEYS.map((key) => (
              <FilterChip
                key={key}
                active={typeFilter === key}
                onClick={() => setTypeFilter(key)}
                title={RITUAL_VISUAL[key].label}
              >
                {RITUAL_VISUAL[key].emoji}
              </FilterChip>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {(
              [
                ["all", "Все статусы"],
                ["in_progress", "В процессе"],
                ["completed", "Проведён"],
                ["awaiting_review", "Ждёт отзыва"],
              ] as const
            ).map(([id, label]) => (
              <FilterChip
                key={id}
                active={statusFilter === id}
                onClick={() => setStatusFilter(id)}
                small
              >
                {label}
              </FilterChip>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-white/40">Нет обрядов по фильтру</p>
            ) : (
              filtered.map((r) => {
                const vis = RITUAL_VISUAL[r.ritualType];
                const master =
                  MASTER_VISUAL[r.characterKey as RitualMasterKey] ?? {
                    emoji: "✨",
                    name: r.characterKey,
                  };
                const date = formatRitualDate(r.createdAt);
                const moonLine = r.moonSign ? ` · Луна в ${r.moonSign} 🌙` : "";
                const awaiting = needsReview(r);
                const inProgress = isRitualInProgress(r.status);
                const busy = deletingRitualId === r.id;
                const masterKey = r.characterKey as RitualMasterKey;

                return (
                  <div
                    key={r.id}
                    className={`rounded-xl border p-3 ${cardBorderStyle(r)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-white">
                            <span style={{ color: vis.color }}>{vis.emoji}</span>{" "}
                            {vis.label}
                          </p>
                          <span className="shrink-0 text-base" aria-hidden>
                            {statusEmoji(r)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-white/50">
                          {master.emoji} {master.name}
                        </p>
                        <p className="text-xs text-white/40">
                          {date}
                          {moonLine}
                        </p>
                        {r.status === "reviewed" && r.outcomeRating ? (
                          <p className="mt-1 text-xs text-amber-300/80">
                            {"★".repeat(Math.min(5, Math.max(0, r.outcomeRating)))}
                            {"☆".repeat(
                              Math.max(0, 5 - Math.min(5, Math.max(0, r.outcomeRating)))
                            )}
                          </p>
                        ) : null}
                        {awaiting ? (
                          <p className="mt-2 text-xs text-amber-300/90">
                            ⚠️ Прошло 7 дней — поделись результатом
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDeleteRitual(r.id)}
                        aria-label="Удалить обряд"
                        className="cabinet-diary-card__delete shrink-0 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </button>
                    </div>

                    <div className="mt-3">
                      {awaiting ? (
                        <button
                          type="button"
                          onClick={() => onOpenRitual(r.id, masterKey)}
                          className="cabinet-btn cabinet-btn--primary w-full text-xs"
                        >
                          Оставить отзыв →
                        </button>
                      ) : inProgress ? (
                        <button
                          type="button"
                          onClick={() => onOpenRitual(r.id, masterKey)}
                          className="cabinet-btn cabinet-btn--primary w-full text-xs"
                        >
                          Продолжить обряд →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenRitual(r.id, masterKey)}
                          className="cabinet-btn cabinet-btn--secondary w-full text-xs"
                        >
                          Открыть карточку →
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="cabinet-rituals-empty">
          <div className="cabinet-rituals-empty__icon-wrap">
            <span className="cabinet-rituals-empty__icon" aria-hidden>
              🕯
            </span>
          </div>
          <p className="cabinet-rituals-empty__title">У вас пока нет обрядов</p>
          <p className="cabinet-rituals-empty__text">
            Обряд — это персональный ритуал, составленный мастером под твою ситуацию
          </p>
          <div className="mt-5 flex justify-center">{newRitualButton}</div>
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  title,
  small,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`cabinet-filter-pill ${active ? "cabinet-filter-pill--active" : ""} ${
        small ? "!py-1 !text-[11px]" : ""
      }`}
    >
      {children}
    </button>
  );
}
