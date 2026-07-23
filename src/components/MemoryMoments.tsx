"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, Sparkles, Trash2, X } from "lucide-react";

type MemoryActivity = {
  id: string;
  factId: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
};

export default function MemoryMoments({
  sessionId,
  active,
}: {
  sessionId?: string;
  active: boolean;
}) {
  const [items, setItems] = useState<MemoryActivity[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MemoryActivity | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    if (!active || !sessionId) return;
    const res = await fetch(
      `/api/memory/activity?sourceEntityId=${encodeURIComponent(sessionId)}`,
      { credentials: "include", cache: "no-store" }
    ).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json().catch(() => ({}))) as {
      activities?: MemoryActivity[];
    };
    if (Array.isArray(data.activities)) setItems(data.activities);
  }, [active, sessionId]);

  useEffect(() => {
    if (!active || !sessionId) {
      setItems([]);
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(), 4_000);
    return () => window.clearInterval(timer);
  }, [active, load, sessionId]);

  const markSeen = async (activityId: string) => {
    await fetch("/api/memory/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [activityId] }),
    }).catch(() => undefined);
  };

  const act = async (
    item: MemoryActivity,
    action: "confirm" | "change" | "forget",
    fact?: string
  ) => {
    setBusyId(item.id);
    try {
      const res = await fetch("/api/memory/facts/action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factId: item.factId, action, fact }),
      });
      if (!res.ok) return;
      await markSeen(item.id);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setEditing(null);
      setDraft("");
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (item: MemoryActivity) => {
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    await markSeen(item.id);
  };

  if (!items.length) return null;
  const item = items[0];

  return (
    <div className="mb-2 rounded-2xl border border-violet-400/20 bg-violet-500/8 p-3 shadow-lg shadow-black/15">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 rounded-lg bg-violet-400/12 p-1.5 text-violet-200">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200/65">
            Запомнила
          </p>
          {editing?.id === item.id ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={400}
                rows={2}
                className="w-full resize-none rounded-lg border border-white/12 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === item.id || draft.trim().length < 6}
                  onClick={() => void act(item, "change", draft.trim())}
                  className="rounded-lg bg-violet-400/15 px-3 py-1.5 text-xs text-violet-100 disabled:opacity-40"
                >
                  Сохранить изменение
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-2 py-1 text-xs text-white/45"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm leading-5 text-white/80">{item.fact}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void act(item, "confirm")}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-200"
                >
                  <Check className="h-3 w-3" aria-hidden /> Верно
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => {
                    setEditing(item);
                    setDraft(item.fact);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/6 px-2.5 py-1.5 text-[11px] text-white/65"
                >
                  <Pencil className="h-3 w-3" aria-hidden /> Изменилось
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void act(item, "forget")}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-400/8 px-2.5 py-1.5 text-[11px] text-red-200/75"
                >
                  <Trash2 className="h-3 w-3" aria-hidden /> Не запоминать
                </button>
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={busyId === item.id}
          onClick={() => void dismiss(item)}
          className="p-1 text-white/30 hover:text-white/60"
          aria-label="Скрыть"
        >
          {busyId === item.id ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <X className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      {items.length > 1 ? (
        <p className="mt-2 text-right text-[10px] text-white/28">
          Ещё сохранено: {items.length - 1}
        </p>
      ) : null}
    </div>
  );
}
