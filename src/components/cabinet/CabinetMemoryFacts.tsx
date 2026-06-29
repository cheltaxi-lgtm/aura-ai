"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Loader2, Plus, Trash2, X } from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import LegalDocLink from "@/components/legal/LegalDocLink";
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

export default function CabinetMemoryFacts({ hideTitle = false }: { hideTitle?: boolean }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdConsent, setPdConsent] = useState(false);

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

  const resetAddForm = () => {
    setDraft("");
    setCategory("other");
    setPdConsent(false);
    setFormError(null);
  };

  const closeAddModal = () => {
    if (saving) return;
    setAddModalOpen(false);
    resetAddForm();
  };

  const handleAdd = async () => {
    const text = draft.trim();
    if (text.length < 6) {
      setFormError("Напишите факт подробнее — от 6 символов.");
      return;
    }
    if (!pdConsent) {
      setFormError("Подтвердите согласие на обработку персональных данных.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/memory/facts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact: text, category, pdConsent: true }),
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
      setAddModalOpen(false);
      resetAddForm();
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
    <>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        {!hideTitle ? (
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
        ) : null}

        <div className={hideTitle ? "" : "mt-4"}>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-purple-400/30 bg-purple-600/20 px-4 py-3 text-sm font-medium text-purple-100 transition-colors hover:border-purple-400/50 hover:bg-purple-600/30 sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить факт
          </button>
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

      <BodyPortal active={addModalOpen}>
        <AnimatePresence>
          {addModalOpen ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="app-modal-overlay fixed inset-0 z-[4990] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm pointer-events-auto sm:items-center sm:p-4"
              onClick={closeAddModal}
            >
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cabinet-memory-add-title"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[min(92dvh,calc(100dvh-1rem))] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-purple-500/20 bg-[#1a1028] shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:rounded-2xl"
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#1a1028]/95 px-5 py-4 backdrop-blur-sm">
                  <div>
                    <h2 id="cabinet-memory-add-title" className="text-lg font-semibold text-white">
                      Новый факт
                    </h2>
                    <p className="mt-1 text-sm text-white/50">
                      Мастер учтёт это в будущих сеансах, если тема совпадёт.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeAddModal}
                    disabled={saving}
                    aria-label="Закрыть"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/50 transition-colors hover:text-white disabled:opacity-40"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3 px-5 py-4">
                  <label className="block text-xs font-medium text-white/50">
                    Текст факта
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, 400))}
                      placeholder="Например: ищу работу в IT, сыну 12 лет, развод в процессе"
                      rows={4}
                      autoFocus
                      className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-purple-400/40 focus:outline-none"
                    />
                  </label>

                  <label className="block text-xs text-white/50">
                    Тема
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-white"
                    >
                      {USER_FACT_CATEGORIES.map((id) => (
                        <option key={id} value={id}>
                          {CATEGORY_LABELS[id] ?? id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-lg border border-white/8 bg-black/25 px-3 py-2.5 text-[11px] leading-relaxed text-white/45">
                    Добавляя сведения о себе, вы даёте оператору платформы Zovus согласие на обработку
                    указанных персональных данных (сбор, запись, хранение, использование) в целях
                    персонализации консультаций, в том числе с применением автоматизированных средств (ИИ),
                    на основании{" "}
                    <LegalDocLink
                      href="/privacy"
                      external
                      className="text-aura-champagne/85 underline underline-offset-2 hover:text-aura-champagne"
                    >
                      Политики обработки персональных данных
                    </LegalDocLink>
                    . Согласие действует до отзыва — удалением фактов, очисткой памяти или аккаунта
                    (152-ФЗ).
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-white/55">
                    <input
                      type="checkbox"
                      checked={pdConsent}
                      onChange={(e) => {
                        setPdConsent(e.target.checked);
                        if (e.target.checked) setFormError(null);
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
                    />
                    <span>
                      Я даю согласие на обработку персональных данных, указанных в поле «Новый факт», в
                      описанных целях.
                    </span>
                  </label>

                  {formError ? <p className="text-xs text-red-300">{formError}</p> : null}

                  <p className="text-[11px] text-white/35">
                    Без карт, гаданий и общих фраз. Можно писать от первого лица — сохраним в формате для
                    мастера.
                  </p>

                  <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeAddModal}
                      disabled={saving}
                      className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/70 transition-colors hover:text-white disabled:opacity-40"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={saving || draft.trim().length < 6 || !pdConsent}
                      onClick={() => void handleAdd()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple-600/80 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Сохранить
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </BodyPortal>
    </>
  );
}
