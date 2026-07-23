"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Brain,
  Briefcase,
  Calendar,
  Check,
  Heart,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import BodyPortal from "@/components/BodyPortal";
import LegalDocLink from "@/components/legal/LegalDocLink";
import {
  FACT_CATEGORY_ACCENTS,
  FACT_CATEGORY_LABELS,
  formatMemoryFactForDisplay,
  resolveFactCategory,
} from "@/lib/memory/user-fact-display";
import { USER_FACT_CATEGORIES, type UserFactCategory } from "@/lib/memory/user-fact-input";

type MemoryFact = {
  id: string;
  fact: string;
  category: string | null;
  eventDate: string | null;
  salience: number;
  addedByUser?: boolean;
  status?: "draft" | "active" | "superseded";
  sourceType?: string | null;
  evidenceQuote?: string | null;
  sourceCapturedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  confirmationCount?: number;
};

type MemoryPrefs = {
  memoryEnabled: boolean;
  autoCaptureEnabled: boolean;
  sensitiveCaptureEnabled: boolean;
  eventRemindersEnabled: boolean;
  momentsMode: "active" | "quiet";
  cabinetMode: "simple" | "advanced";
};

const CATEGORY_ICONS: Record<UserFactCategory, LucideIcon> = {
  family: Heart,
  work: Briefcase,
  health: Activity,
  money: Wallet,
  relationship: Users,
  event: Calendar,
  goal: Target,
  other: Sparkles,
};

function factCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} сохранённый факт`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${count} сохранённых факта`;
  }
  return `${count} сохранённых фактов`;
}

function PrefToggle({
  checked,
  disabled,
  busy,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  hint: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-3 ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || busy}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white/85">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-white/40">{hint}</span>
      </span>
    </label>
  );
}

export default function CabinetMemoryFacts({ hideTitle = false }: { hideTitle?: boolean }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [prefs, setPrefs] = useState<MemoryPrefs>({
    memoryEnabled: false,
    autoCaptureEnabled: false,
    sensitiveCaptureEnabled: false,
    eventRemindersEnabled: false,
    momentsMode: "active",
    cabinetMode: "simple",
  });
  const [loading, setLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<MemoryFact | null>(null);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [eventDate, setEventDate] = useState("");
  const [view, setView] = useState<"current" | "changes" | "events">("current");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdConsent, setPdConsent] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [factsRes, prefsRes] = await Promise.all([
        fetch("/api/memory/facts?view=timeline", { credentials: "include" }),
        fetch("/api/memory/preferences", { credentials: "include" }),
      ]);
      const factsData = (await factsRes.json().catch(() => ({}))) as {
        facts?: MemoryFact[];
        error?: string;
      };
      const prefsData = (await prefsRes.json().catch(() => ({}))) as {
        preferences?: MemoryPrefs;
      };
      if (!factsRes.ok) {
        throw new Error(factsData.error ?? "load_failed");
      }
      setFacts(Array.isArray(factsData.facts) ? factsData.facts : []);
      if (prefsRes.ok && prefsData.preferences) {
        setPrefs({
          memoryEnabled: Boolean(prefsData.preferences.memoryEnabled),
          autoCaptureEnabled: Boolean(prefsData.preferences.autoCaptureEnabled),
          sensitiveCaptureEnabled: Boolean(prefsData.preferences.sensitiveCaptureEnabled),
          eventRemindersEnabled: Boolean(prefsData.preferences.eventRemindersEnabled),
          momentsMode: prefsData.preferences.momentsMode === "quiet" ? "quiet" : "active",
          cabinetMode: prefsData.preferences.cabinetMode === "advanced" ? "advanced" : "simple",
        });
      }
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
    setEventDate("");
    setPdConsent(false);
    setFormError(null);
    setEditingFact(null);
  };

  const closeAddModal = () => {
    if (saving) return;
    setAddModalOpen(false);
    resetAddForm();
  };

  const openEdit = (fact: MemoryFact) => {
    setEditingFact(fact);
    setDraft(fact.fact);
    setCategory(resolveFactCategory(fact.category));
    setEventDate(fact.eventDate ?? "");
    setPdConsent(true);
    setFormError(null);
    setAddModalOpen(true);
  };

  const patchPrefs = async (patch: Partial<MemoryPrefs>) => {
    const next = { ...prefs, ...patch };
    if (!next.memoryEnabled) {
      next.autoCaptureEnabled = false;
      next.sensitiveCaptureEnabled = false;
      next.eventRemindersEnabled = false;
    }
    if (!next.autoCaptureEnabled) {
      next.sensitiveCaptureEnabled = false;
    }

    const enabling =
      Boolean(patch.memoryEnabled) ||
      Boolean(patch.autoCaptureEnabled) ||
      Boolean(patch.sensitiveCaptureEnabled);

    setPrefsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...next,
          pdConsent: enabling ? true : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        preferences?: MemoryPrefs;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "prefs_failed");
      }
      if (data.preferences) {
        setPrefs({
          memoryEnabled: Boolean(data.preferences.memoryEnabled),
          autoCaptureEnabled: Boolean(data.preferences.autoCaptureEnabled),
          sensitiveCaptureEnabled: Boolean(data.preferences.sensitiveCaptureEnabled),
          eventRemindersEnabled: Boolean(data.preferences.eventRemindersEnabled),
          momentsMode: data.preferences.momentsMode === "quiet" ? "quiet" : "active",
          cabinetMode: data.preferences.cabinetMode === "advanced" ? "advanced" : "simple",
        });
      } else {
        setPrefs(next);
      }
    } catch {
      setError("Не удалось сохранить настройки памяти.");
      await load();
    } finally {
      setPrefsSaving(false);
    }
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
      if (editingFact) {
        const res = await fetch("/api/memory/facts", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            factId: editingFact.id,
            fact: text,
            category,
            eventDate: eventDate || null,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          fact?: MemoryFact;
          message?: string;
        };
        if (!res.ok) {
          setFormError(data.message ?? "Не удалось обновить факт.");
          return;
        }
        if (data.fact?.id) {
          setFacts((prev) => prev.map((f) => (f.id === data.fact!.id ? data.fact! : f)));
        } else {
          await load();
        }
      } else {
        const res = await fetch("/api/memory/facts", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fact: text,
            category,
            eventDate: eventDate || null,
            pdConsent: true,
          }),
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
        setPrefs((p) => ({ ...p, memoryEnabled: true }));
      }
      setAddModalOpen(false);
      resetAddForm();
    } catch {
      setFormError(editingFact ? "Не удалось обновить факт." : "Не удалось сохранить факт.");
    } finally {
      setSaving(false);
    }
  };

  const handlePurgeAll = async () => {
    if (
      !window.confirm(
        "Полностью очистить персональную память? Сохранённые факты и краткие итоги сеансов будут удалены, согласие отозвано. Исходная история сообщений удаляется отдельно. Действие необратимо."
      )
    ) {
      return;
    }
    setPurging(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/purge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "purge_failed");
      }
      setFacts([]);
      setPrefs({
        memoryEnabled: false,
        autoCaptureEnabled: false,
        sensitiveCaptureEnabled: false,
        eventRemindersEnabled: false,
        momentsMode: "active",
        cabinetMode: "simple",
      });
    } catch {
      setError("Не удалось очистить память. Попробуйте позже.");
    } finally {
      setPurging(false);
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

  const handleConfirm = async (factId: string) => {
    setDeletingId(factId);
    try {
      const res = await fetch("/api/memory/facts/action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factId, action: "confirm" }),
      });
      if (!res.ok) throw new Error("confirm_failed");
      await load();
    } catch {
      setError("Не удалось подтвердить факт.");
    } finally {
      setDeletingId(null);
    }
  };

  const displayedFacts = facts.filter((fact) => {
    if (view === "changes") return fact.status === "superseded";
    if (view === "events") return Boolean(fact.eventDate) && fact.status !== "superseded";
    return fact.status !== "superseded";
  });

  return (
    <>
      <section className={hideTitle ? "space-y-5" : "rounded-2xl border border-white/10 bg-white/[0.03] p-5"}>
        {!hideTitle ? (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
              <Brain className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-white">Персональная память</h2>
              <p className="mt-1 text-sm text-white/50">
                Важные сведения используются только по теме сеанса и всегда остаются под вашим
                контролем.
              </p>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
            Согласие и настройки
          </p>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/20 p-1">
            {(["simple", "advanced"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={prefsSaving}
                onClick={() => void patchPrefs({ cabinetMode: mode })}
                className={`rounded-lg px-3 py-2 text-xs ${
                  prefs.cabinetMode === mode
                    ? "bg-purple-500/20 text-purple-100"
                    : "text-white/40"
                }`}
              >
                {mode === "simple" ? "Простой" : "Расширенный"}
              </button>
            ))}
          </div>
          <PrefToggle
            checked={prefs.memoryEnabled}
            busy={prefsSaving}
            label="Использовать память в сеансах"
            hint="Факты из списка ниже могут попадать в ответы мастера, если тема совпадает."
            onChange={(memoryEnabled) => void patchPrefs({ memoryEnabled })}
          />
          {prefs.cabinetMode === "advanced" ? <PrefToggle
            checked={prefs.autoCaptureEnabled}
            disabled={!prefs.memoryEnabled}
            busy={prefsSaving}
            label="Автозапоминание из чата"
            hint="Система сможет извлекать факты из ваших сообщений в фоне. Без этого — только ручные записи."
            onChange={(autoCaptureEnabled) => void patchPrefs({ autoCaptureEnabled })}
          /> : null}
          {prefs.cabinetMode === "advanced" ? <PrefToggle
            checked={prefs.sensitiveCaptureEnabled}
            disabled={!prefs.memoryEnabled || !prefs.autoCaptureEnabled}
            busy={prefsSaving}
            label="Чувствительные темы"
            hint="Разрешить автозапоминание более личных сведений (здоровье, деньги, отношения)."
            onChange={(sensitiveCaptureEnabled) => void patchPrefs({ sensitiveCaptureEnabled })}
          /> : null}
          {prefs.cabinetMode === "advanced" ? <PrefToggle
            checked={prefs.eventRemindersEnabled}
            disabled={!prefs.memoryEnabled}
            busy={prefsSaving}
            label="Напоминания о событиях"
            hint="Короткое уведомление перед датами, которые вы сохранили в памяти."
            onChange={(eventRemindersEnabled) => void patchPrefs({ eventRemindersEnabled })}
          /> : null}
          <PrefToggle
            checked={prefs.momentsMode === "active"}
            disabled={!prefs.memoryEnabled}
            busy={prefsSaving}
            label="Показывать моменты памяти"
            hint="Показывать до двух новых фактов в текущем сеансе."
            onChange={(enabled) =>
              void patchPrefs({ momentsMode: enabled ? "active" : "quiet" })
            }
          />
          <p className="text-[11px] leading-relaxed text-white/35">
            Включая память, вы соглашаетесь на обработку указанных персональных данных по{" "}
            <LegalDocLink
              href="/privacy"
              external
              className="text-aura-champagne/85 underline underline-offset-2 hover:text-aura-champagne"
            >
              Политике
            </LegalDocLink>
            . Отзыв — выключением тумблеров, очисткой памяти или удалением аккаунта.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/8 bg-black/20 p-1">
          {([
            ["current", "Сейчас"],
            ["changes", "Изменения"],
            ["events", "События"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-lg px-2 py-2 text-xs transition ${
                view === id ? "bg-purple-500/20 text-purple-100" : "text-white/40 hover:text-white/65"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!loading && facts.length > 0 ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-400/70">
              {factCountLabel(facts.length)}
            </p>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => {
              resetAddForm();
              setAddModalOpen(true);
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-400/25 bg-gradient-to-r from-purple-700/35 via-purple-900/40 to-amber-950/30 px-5 py-3.5 text-sm font-semibold text-amber-100 shadow-[0_8px_32px_rgba(88,28,135,0.25),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all hover:border-amber-400/40 hover:shadow-[0_12px_40px_rgba(88,28,135,0.35)] sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Добавить факт
          </button>
        </div>

        {!loading && facts.length > 0 ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handlePurgeAll()}
              disabled={purging}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/35 transition-colors hover:text-red-300 disabled:opacity-50"
            >
              {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Очистить всю память
            </button>
          </div>
        ) : null}

        <div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/8 bg-black/20 py-12 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Загрузка памяти…
            </div>
          ) : error ? (
            <p className="rounded-2xl border border-red-400/20 bg-red-950/20 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          ) : displayedFacts.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/12 bg-gradient-to-br from-purple-950/30 via-black/20 to-amber-950/15 px-6 py-10 text-center">
              <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-purple-600/10 blur-2xl" />
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-300">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <p className="mt-4 text-base font-medium text-white/85">Пока пусто</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/45">
                Добавьте факты о себе — семья, работа, планы. Мастер подхватит их после включения
                памяти, когда тема сеанса совпадёт.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {displayedFacts.map((f) => {
                const cat = resolveFactCategory(f.category);
                const accent = FACT_CATEGORY_ACCENTS[cat];
                const Icon = CATEGORY_ICONS[cat];
                const stale =
                  f.status !== "superseded" &&
                  Boolean(f.sourceCapturedAt) &&
                  Date.now() - new Date(f.sourceCapturedAt!).getTime() > 120 * 86_400_000 &&
                  !f.confirmationCount;
                return (
                  <li
                    key={f.id}
                    className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] via-purple-950/25 to-black/50 p-4 shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all ${accent.ring}`}
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/25 to-transparent" />
                    <div className="flex gap-3.5">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10 ${accent.iconWrap}`}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${accent.badge}`}
                          >
                            {FACT_CATEGORY_LABELS[cat]}
                          </span>
                          {f.eventDate ? (
                            <span className="text-[11px] text-white/35">{f.eventDate}</span>
                          ) : null}
                          {f.salience >= 5 ? (
                            <span className="text-[10px] font-medium text-amber-400/80">важное</span>
                          ) : null}
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-medium ${
                              f.addedByUser ? "text-emerald-400/70" : "text-white/30"
                            }`}
                          >
                            {f.addedByUser ? "добавлено вами" : "замечено автоматически"}
                          </span>
                          {f.status === "superseded" ? (
                            <span className="text-[10px] text-white/30">изменилось</span>
                          ) : null}
                          {f.status === "draft" ? (
                            <span className="text-[10px] text-violet-300/80">предложение</span>
                          ) : null}
                        </div>
                        <p className="text-[15px] leading-relaxed text-white/92">
                          {formatMemoryFactForDisplay(f.fact)}
                        </p>
                        {f.evidenceQuote ? (
                          <p className="mt-2 border-l border-white/10 pl-2 text-[11px] italic text-white/35">
                            Из вашего сообщения: «{f.evidenceQuote}»
                          </p>
                        ) : null}
                        {stale || f.status === "draft" ? (
                          <button
                            type="button"
                            disabled={deletingId === f.id}
                            onClick={() => void handleConfirm(f.id)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/8 px-2.5 py-1.5 text-[11px] text-emerald-200/80"
                          >
                            <Check className="h-3 w-3" aria-hidden />
                            {f.status === "draft" ? "Сохранить в память" : "Это всё ещё актуально"}
                          </button>
                        ) : null}
                      </div>
                      {f.status !== "superseded" ? (
                      <div className="flex shrink-0 flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(f)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/35 transition-colors hover:border-amber-400/35 hover:text-amber-200"
                          aria-label="Редактировать факт"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === f.id}
                          onClick={() => void handleDelete(f.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/35 transition-colors hover:border-red-400/35 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-50"
                          aria-label="Удалить факт"
                        >
                          {deletingId === f.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
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
                      {editingFact ? "Изменить факт" : "Новый факт"}
                    </h2>
                    <p className="mt-1 text-sm text-white/50">
                      Мастер учтёт это в будущих сеансах, если тема совпадёт и память включена.
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
                          {FACT_CATEGORY_LABELS[id]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-xs text-white/50">
                    Дата события
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                    <span className="mt-1 block text-[10px] text-white/30">
                      Если включены напоминания, сервис заранее напомнит об этой дате.
                    </span>
                  </label>

                  {!editingFact ? (
                    <>
                      <div className="rounded-lg border border-white/8 bg-black/25 px-3 py-2.5 text-[11px] leading-relaxed text-white/45">
                        Добавляя сведения о себе, вы даёте оператору платформы Zovus согласие на
                        обработку указанных персональных данных (сбор, запись, хранение,
                        использование) в целях персонализации консультаций, в том числе с применением
                        автоматизированных средств, на основании{" "}
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
                          Я даю согласие на обработку персональных данных, указанных в поле «Новый
                          факт», в описанных целях.
                        </span>
                      </label>
                    </>
                  ) : null}

                  {formError ? <p className="text-xs text-red-300">{formError}</p> : null}

                  <p className="text-[11px] text-white/35">
                    Без карт, гаданий и общих фраз. Можно писать от первого лица — сохраним в формате
                    для мастера.
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
                      disabled={
                        saving || draft.trim().length < 6 || (!editingFact && !pdConsent)
                      }
                      onClick={() => void handleAdd()}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple-600/80 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-40"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : editingFact ? (
                        <Pencil className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {editingFact ? "Сохранить" : "Добавить"}
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
