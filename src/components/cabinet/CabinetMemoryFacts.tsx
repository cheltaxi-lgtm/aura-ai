"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Plus, Trash2 } from "lucide-react";
import { USER_FACT_CATEGORIES } from "@/lib/memory/user-fact-input";

type MemoryFact = {
  id: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
  salience: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  family: "Семья",
  work: "Работа",
  health: "Здоровье",
  money: "Деньги",
  relationship: "Отношения",
  event: "Событие",
  goal: "Цель",
  other: "Другое",
};

export default function CabinetMemoryFacts() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/facts", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        facts?: MemoryFact[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "load_failed");
      }
      setFacts(Array.isArray(data.facts) ? data.facts : []);
    } catch {
      setError("Не удалось загрузить память.");
      setFacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    const text = draft.trim();
    if (text.length < 6) {
      setFormError("Напишите факт подробнее — от 6 символов.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/memory/facts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact: text, category }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        fact?: MemoryFact;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setFormError(data.message ?? "Не удалось сохранить факт.");
        return;
      }
      if (data.fact?.id) {
        setFacts((prev) => {
          const withoutDup = prev.filter((f) => f.id !== data.fact!.id);
          return [data.fact!, ...withoutDup];
        });
      } else {
        await load();
      }
      setDraft("");
    } catch {
      setFormError("Не удалось сохранить факт.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (factId: string) => {
    if (!window.confirm("Удалить этот факт из памяти мастера?")) return;
    setDeletingId(factId);
    try {
      const res = await fetch(`/api/memory/facts?factId=${encodeURIComponent(factId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("delete_failed");
      setFacts((prev) => prev.filter((f) => f.id !== factId));
    } catch {
      setError("Не удалось удалить факт.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
          <Brain className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-white">Память о вас</h2>
          <p className="mt-1 text-sm text-white/50">
            Добавляйте важное о себе — мастер учтёт это в будущих сеансах, если тема совпадёт.
            Можно удалить устаревшее.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-white/8 bg-black/20 p-3">
        <label className="block text-xs font-medium text-white/50">
          Новый факт
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 400))}
            placeholder="Например: ищу работу в IT, сыну 12 лет, развод в процессе"
            rows={3}
            className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-purple-400/40 focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-white/50">
            Тема
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
            >
              {USER_FACT_CATEGORIES.map((id) => (
                <option key={id} value={id}>
                  {CATEGORY_LABELS[id] ?? id}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={saving || draft.trim().length < 6}
            onClick={() => void handleAdd()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600/80 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Сохранить
          </button>
        </div>
        {formError ? <p className="text-xs text-red-300">{formError}</p> : null}
        <p className="text-[11px] text-white/35">
          Без карт, гаданий и общих фраз. Можно писать от первого лица — сохраним в формате для мастера.
        </p>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Загрузка…
          </div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : facts.length === 0 ? (
          <p className="text-sm text-white/45">Пока нет сохранённых фактов.</p>
        ) : (
          <ul className="space-y-2">
            {facts.map((f) => (
              <li
                key={f.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white/90">{f.fact}</p>
                  <p className="mt-1 text-xs text-white/40">
                    {CATEGORY_LABELS[f.category ?? "other"] ?? f.category ?? "other"}
                    {f.eventDate ? ` · ${f.eventDate}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={deletingId === f.id}
                  onClick={() => void handleDelete(f.id)}
                  className="shrink-0 rounded-lg border border-white/10 p-2 text-white/40 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50"
                  aria-label="Удалить факт"
                >
                  {deletingId === f.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
