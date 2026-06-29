"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Trash2 } from "lucide-react";

type MemoryFact = {
  id: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
  salience: number;
};

export default function CabinetMemoryFacts() {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            Факты, которые мастер запомнил между сеансами. Удаляйте то, что больше не актуально.
          </p>
        </div>
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
                    {f.category ?? "other"}
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
