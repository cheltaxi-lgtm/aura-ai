"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import PremiumReadingBody from "@/components/PremiumReadingBody";
import { MASTER_DISPLAY, isCharacterKey } from "@/lib/prompts";
import type { CharacterKey } from "@/lib/prompts/types";

const MASTER_EMOJI: Record<CharacterKey, string> = {
  ragnar: "⚔️",
  agafya: "🌿",
  veronika: "🔮",
  "shri-raj": "🕉️",
  numerolog: "🔢",
};

interface DiaryEntry {
  id: string;
  character_key: string;
  entry_text: string;
  created_at: string;
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/diary", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setEntries(data.entries ?? []);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (entryId: string) => {
    const confirmed = window.confirm("Удалить эту запись дневника безвозвратно?");
    if (!confirmed) return;

    setDeletingId(entryId);
    try {
      const res = await fetch(`/api/diary/${encodeURIComponent(entryId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Не удалось удалить запись");
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch {
      window.alert("Не удалось удалить запись. Попробуйте позже.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#0a0a0f]">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="btn-luxe btn-luxe--sm btn-luxe--silver">
          ← На главную
        </Link>
        <h1 className="mt-6 font-display text-3xl font-bold text-white">Дневник судьбы</h1>
        <p className="mt-2 text-sm text-gray-500">Записи после сеансов с мастерами</p>

        {loading ? (
          <div className="mt-12 space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-16 text-center text-gray-500 leading-relaxed"
          >
            Ваш дневник судьбы пуст.
            <br />
            Первая запись появится после сеанса с мастером.
          </motion.p>
        ) : (
          <div className="mt-10 space-y-4">
            {entries.map((entry, i) => {
              const key = isCharacterKey(entry.character_key)
                ? entry.character_key
                : "veronika";
              return (
                <motion.article
                  key={entry.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl border border-white/10 bg-black/40 p-5"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{MASTER_EMOJI[key]}</span>
                      <span>{MASTER_DISPLAY[key]}</span>
                      <span>·</span>
                      <time>
                        {new Date(entry.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <button
                      type="button"
                      disabled={deletingId === entry.id}
                      onClick={() => void handleDelete(entry.id)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-gray-400 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-40"
                      aria-label="Удалить запись"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <PremiumReadingBody content={entry.entry_text} className="text-sm text-gray-300" />
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
