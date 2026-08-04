"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Trash2, Users } from "lucide-react";
import { formatCabinetDate, formatCabinetPredictionPreview, truncate } from "@/lib/cabinet-utils";

type JointItem = {
  token: string;
  url: string;
  status: string;
  intentTitle: string;
  initiatorName: string | null;
  partnerName: string | null;
  hasInitiatorReading: boolean;
  hasPartnerReading: boolean;
  hasCombined: boolean;
  preview: string | null;
  createdAt: string;
  expiresAt: string;
  isInitiator: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  pending_partner: "Ждём партнёра",
  partner_done: "Ждём ваш расклад",
  completed: "Готово",
  expired: "Истекло",
};

interface Props {
  variant?: "compact" | "history";
}

export default function CabinetJointReadings({ variant = "history" }: Props) {
  const [items, setItems] = useState<JointItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deletingToken, setDeletingToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/joint-reading/mine", { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: JointItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeItem = async (item: JointItem) => {
    const who = [item.initiatorName ?? "Вы", item.partnerName ?? "партнёр"].join(" и ");
    const confirmed = window.confirm(
      `Удалить совместный расклад «${item.intentTitle}» (${who}) безвозвратно?\nПропадёт из кабинета у обоих участников, приглашение и ссылки перестанут открываться. Руны не возвращаются.`
    );
    if (!confirmed) return;

    setDeletingToken(item.token);
    try {
      const res = await fetch(`/api/joint-reading/${encodeURIComponent(item.token)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        window.alert("Не удалось удалить расклад. Попробуйте ещё раз.");
        return;
      }
      setItems((prev) => prev.filter((row) => row.token !== item.token));
    } catch {
      window.alert("Не удалось удалить расклад. Проверьте соединение.");
    } finally {
      setDeletingToken(null);
    }
  };

  if (!loaded || items.length === 0) return null;

  if (variant === "compact") {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-aura-gold">
          <Users className="h-4 w-4" />
          <h2 className="text-sm font-medium text-white">Совместные расклады</h2>
        </div>
        <ul className="mt-3 space-y-2">
          {items.slice(0, 3).map((item) => (
            <li
              key={item.token}
              className="flex items-stretch overflow-hidden rounded-xl border border-white/8 bg-black/20"
            >
              <Link
                href={`/joint-reading/${item.token}`}
                className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm transition hover:bg-white/[0.03]"
              >
                <span className="text-white/80">
                  {item.initiatorName ?? "Вы"} · {item.partnerName ?? "Партнёр"}
                </span>
                <span className="text-xs text-white/45">
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </Link>
              <button
                type="button"
                disabled={deletingToken === item.token}
                onClick={() => void removeItem(item)}
                aria-label="Удалить совместный расклад"
                title="Удалить"
                className="border-l border-white/10 px-2.5 text-white/35 transition hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
              >
                {deletingToken === item.token ? "…" : "×"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-aura-gold/80">Совместные расклады</p>
        <h2 className="mt-1 font-display text-lg text-white">Расклады для двоих</h2>
      </div>
      <div className="space-y-4">
        {items.map((item, index) => {
          const preview = item.preview ? formatCabinetPredictionPreview(item.preview) : null;
          const deleting = deletingToken === item.token;
          return (
            <motion.article
              key={item.token}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="cabinet-session-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-aura-gold/10 text-lg">
                    <Users className="h-5 w-5 text-aura-gold" aria-hidden />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{item.intentTitle}</p>
                    <p className="text-xs text-white/40">
                      {formatCabinetDate(item.createdAt)} ·{" "}
                      {item.initiatorName ?? "Вы"} и {item.partnerName ?? "партнёр"}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-aura-gold/90">
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </div>

              <p className="mt-3 text-sm text-white/70">
                {item.hasInitiatorReading ? "✓ Ваш расклад" : "○ Ваш расклад"}
                {" · "}
                {item.hasPartnerReading ? "✓ Партнёр" : "○ Партнёр"}
              </p>

              {preview ? (
                <div className="mt-4">
                  <p className="text-xs text-white/40">
                    {item.hasCombined ? "Общая интерпретация" : "Ваш фрагмент"}
                  </p>
                  <p className="cabinet-session-card__prediction">{truncate(preview, 220)}</p>
                </div>
              ) : null}

              <div className="cabinet-session-card__actions">
                <Link
                  href={`/joint-reading/${item.token}`}
                  className="cabinet-btn cabinet-btn--primary"
                >
                  {item.hasCombined ? "Читать результат" : "Открыть приглашение"}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </Link>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void removeItem(item)}
                  className="cabinet-btn cabinet-btn--danger"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {deleting ? "Удаление…" : "Удалить"}
                </button>
              </div>
            </motion.article>
          );
        })}
      </div>
      <Link href="/joint-reading" className="inline-block text-sm text-aura-gold hover:underline">
        Создать новый совместный расклад →
      </Link>
    </section>
  );
}
