"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import AdminShell, { AdminTitle, StatCard, AdminBtn } from "@/components/admin/AdminShell";
import {
  LANDING_REVIEW_PRODUCT_LABELS,
  LANDING_REVIEW_STATUS_LABELS,
  isLandingReviewProduct,
  isLandingReviewStatus,
  type LandingReviewProduct,
  type LandingReviewStatus,
} from "@/lib/landing-reviews-shared";

type AdminReview = {
  id: string;
  source: "seed" | "user";
  status: LandingReviewStatus;
  rating: number;
  author_name: string;
  city: string | null;
  product: string;
  body: string;
  admin_note: string | null;
  moderated_by: string | null;
  created_at: string;
};

const STATUS_FILTERS = [
  { id: "pending", label: "На модерации" },
  { id: "approved", label: "Опубликованные" },
  { id: "rejected", label: "Отклонённые" },
  { id: "all", label: "Все" },
] as const;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function productLabel(value: string): string {
  return isLandingReviewProduct(value)
    ? LANDING_REVIEW_PRODUCT_LABELS[value as LandingReviewProduct]
    : value;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [stats, setStats] = useState({ approved: 0, pending: 0, rejected: 0, averageRating: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("status", statusFilter);
    const res = await fetch(`/api/admin/reviews?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setReviews(data.reviews ?? []);
    setStats(data.stats ?? { approved: 0, pending: 0, rejected: 0, averageRating: 0 });
  }, [statusFilter]);

  useEffect(() => {
    void loadList().finally(() => setLoading(false));
  }, [loadList]);

  useEffect(() => {
    const active = reviews.find((row) => row.id === selectedId);
    setNote(active?.admin_note ?? "");
  }, [reviews, selectedId]);

  const active = reviews.find((row) => row.id === selectedId) ?? null;

  const patchReview = async (patch: { status?: "approved" | "rejected"; adminNote?: string | null }) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/reviews/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      await loadList();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <AdminTitle title="Отзывы" subtitle="Модерация отзывов с гостевого лендинга" />
        <AdminBtn onClick={() => void loadList()} disabled={loading}>
          <RefreshCw className={`mr-1.5 inline h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </AdminBtn>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="На модерации" value={stats.pending} />
        <StatCard label="Опубликовано" value={stats.approved} />
        <StatCard label="Отклонено" value={stats.rejected} />
        <StatCard
          label="Средняя оценка"
          value={stats.averageRating ? stats.averageRating.toFixed(1) : "—"}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setStatusFilter(f.id);
              setSelectedId(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              statusFilter === f.id
                ? "bg-aura-gold/25 text-aura-champagne"
                : "bg-white/5 text-gray-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка…
            </div>
          ) : reviews.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-gray-500">Записей нет</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {reviews.map((row) => {
                const activeRow = selectedId === row.id;
                const status = isLandingReviewStatus(row.status) ? row.status : "pending";
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        activeRow ? "bg-aura-gold/15" : "hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {row.author_name} · {"★".repeat(row.rating)}
                          </p>
                          <p className="truncate text-xs text-gray-400">
                            {productLabel(row.product)}
                            {row.city ? ` · ${row.city}` : ""} · {row.source === "seed" ? "сиды" : "пользователь"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-500">
                          {LANDING_REVIEW_STATUS_LABELS[status]}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-600">{formatWhen(row.created_at)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          {!active ? (
            <p className="py-12 text-center text-sm text-gray-500">Выберите отзыв слева</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-medium text-white">{active.author_name}</p>
                <p className="text-xs text-gray-400">
                  {productLabel(active.product)}
                  {active.city ? ` · ${active.city}` : ""} · {active.rating}/5
                </p>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{active.body}</p>
              <div className="flex flex-wrap gap-2">
                {active.status !== "approved" ? (
                  <AdminBtn
                    onClick={() => void patchReview({ status: "approved" })}
                    disabled={saving}
                  >
                    Опубликовать
                  </AdminBtn>
                ) : null}
                {active.status !== "rejected" ? (
                  <AdminBtn
                    onClick={() => void patchReview({ status: "rejected" })}
                    disabled={saving}
                  >
                    Отклонить
                  </AdminBtn>
                ) : null}
              </div>
              <label className="block text-xs text-gray-400">
                Заметка модератора
                <textarea
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                />
              </label>
              <AdminBtn
                onClick={() => void patchReview({ adminNote: note })}
                disabled={saving}
              >
                Сохранить заметку
              </AdminBtn>
              {active.moderated_by ? (
                <p className="text-[11px] text-gray-600">Модератор: {active.moderated_by}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
