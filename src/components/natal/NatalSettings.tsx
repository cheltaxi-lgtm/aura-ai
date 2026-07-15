"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings } from "lucide-react";
import { IMPORTANCE_PLANET_KEYS, russianPlanetLabel, TIMING_CATEGORY_LABELS } from "@/lib/natal/labels";
import type { TimingCategory, TimingHorizon } from "@/lib/natal/timing";

type AiPreferences = {
  aiContextEnabled: boolean;
  tarotContextEnabled: boolean;
};

type EventPreferences = {
  enabled: boolean;
  horizons: TimingHorizon[];
  categories: TimingCategory[];
  planetImportance: string[];
  frequency: "daily" | "weekly";
  inApp: boolean;
  push: boolean;
  timezone: string;
};

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T | null;
  if (!data) throw new Error(`Сервер вернул некорректный ответ (${response.status})`);
  return data;
}

export default function NatalSettings() {
  const [ai, setAi] = useState<AiPreferences | null>(null);
  const [events, setEvents] = useState<EventPreferences | null>(null);
  const [saving, setSaving] = useState<"ai" | "events" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    Promise.all([
      fetch("/api/natal-chart/ai-preferences", { credentials: "include", signal: controller.signal })
        .then(async (response) => {
          const data = await json<{ preferences?: AiPreferences; error?: string }>(response);
          if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось загрузить настройки ИИ");
          return data.preferences;
        }),
      fetch("/api/natal-chart/event-preferences", { credentials: "include", signal: controller.signal })
        .then(async (response) => {
          const data = await json<{ preferences?: EventPreferences; error?: string }>(response);
          if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось загрузить уведомления");
          return data.preferences;
        }),
    ]).then(([nextAi, nextEvents]) => {
      setAi(nextAi);
      setEvents(nextEvents);
    }).catch((reason) => {
      if ((reason as Error).name !== "AbortError") setError(reason instanceof Error ? reason.message : "Ошибка сети");
    });
    return () => controller.abort();
  }, []);

  const saveAi = async (patch: Partial<AiPreferences>) => {
    setSaving("ai");
    setError("");
    try {
      const response = await fetch("/api/natal-chart/ai-preferences", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await json<{ preferences?: AiPreferences; error?: string }>(response);
      if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось сохранить настройку");
      setAi(data.preferences);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setSaving(null);
    }
  };

  const saveEvents = async (patch: Partial<EventPreferences>) => {
    setSaving("events");
    setError("");
    try {
      const response = await fetch("/api/natal-chart/event-preferences", {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await json<{ preferences?: EventPreferences; error?: string }>(response);
      if (!response.ok || !data.preferences) throw new Error(data.error || "Не удалось сохранить уведомления");
      setEvents(data.preferences);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка сети");
    } finally {
      setSaving(null);
    }
  };

  return <div className="space-y-6">
    <section className="rounded-2xl border border-white/10 bg-white/[0.025]">
      <header className="border-b border-white/[0.06] px-5 py-5">
        <p className="text-[10px] uppercase tracking-[.14em] text-amber-200/45">Приватность и персонализация</p>
        <h2 className="mt-2 flex items-center gap-2 font-display text-xl font-semibold"><Settings className="h-5 w-5 text-amber-200" /> Настройки астрологии</h2>
      </header>
      <div className="space-y-6 p-5">
        {error ? <p className="rounded-xl border border-rose-400/25 bg-rose-400/[0.07] p-3 text-sm text-rose-200" role="alert">{error}</p> : null}
        {!ai || !events ? <p className="flex items-center gap-2 text-sm text-white/45" role="status"><Loader2 className="h-4 w-4 animate-spin" /> Загружаем настройки…</p> : null}
        {ai ? <section aria-labelledby="ai-context-title">
          <h3 id="ai-context-title" className="font-display text-lg text-amber-50">Контекст для Shri Raj</h3>
          <p className="mt-2 text-xs leading-5 text-white/45">По умолчанию выключены.</p>
          <div className="mt-4 space-y-3">
            <PreferenceCheckbox checked={ai.aiContextEnabled} disabled={saving === "ai"} onChange={(value) => void saveAi({ aiContextEnabled: value })}
              label="Разрешить натальный контекст в обычном чате с Shri Raj" />
            <PreferenceCheckbox checked={ai.tarotContextEnabled} disabled={saving === "ai"} onChange={(value) => void saveAi({ tarotContextEnabled: value })}
              label="Отдельно разрешить натальный контекст в раскладах Таро Shri Raj"
              description="Настройка не зависит от обычного чата. Карты Таро остаются главным источником расклада." />
          </div>
        </section> : null}
        {events ? <section className="border-t border-white/8 pt-6" aria-labelledby="event-settings-title">
          <h3 id="event-settings-title" className="font-display text-lg text-amber-50">Уведомления о событиях</h3>
          <p className="mt-2 text-xs leading-5 text-white/45">Настройки управляют доставкой расчётных событий, но не меняют расчёт и не создают прогноз.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <PreferenceCheckbox checked={events.enabled} disabled={saving === "events"} onChange={(value) => void saveEvents({ enabled: value })} label="События включены" />
            <PreferenceCheckbox checked={events.inApp} disabled={saving === "events"} onChange={(value) => void saveEvents({ inApp: value })} label="В приложении" />
            <label className="text-xs text-white/45">Частота
              <select value={events.frequency} disabled={saving === "events"} onChange={(event) => void saveEvents({ frequency: event.target.value as "daily" | "weekly" })}
                className="mt-1 block min-h-11 w-full rounded-lg border border-white/10 bg-[#15121b] px-3 text-sm text-white">
                <option value="daily">Ежедневно</option><option value="weekly">Еженедельно</option>
              </select>
            </label>
          </div>
          <details className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4">
            <summary className="cursor-pointer text-sm font-medium text-white/70">Расширенные фильтры уведомлений</summary>
            <div className="mt-4 grid gap-5 lg:grid-cols-3">
              <CheckboxGroup title="Горизонты" values={([7, 30, 90, 365] as TimingHorizon[])} selected={events.horizons}
                label={(value) => value === 365 ? "1 год" : `${value} дней`}
                onToggle={(value) => void saveEvents({ horizons: toggle(events.horizons, value) })} />
              <CheckboxGroup title="Категории" values={Object.keys(TIMING_CATEGORY_LABELS) as TimingCategory[]} selected={events.categories}
                label={(value) => TIMING_CATEGORY_LABELS[value]}
                onToggle={(value) => void saveEvents({ categories: toggle(events.categories, value) })} />
              <CheckboxGroup title="Важные планеты" values={IMPORTANCE_PLANET_KEYS} selected={events.planetImportance}
                label={russianPlanetLabel}
                onToggle={(value) => void saveEvents({ planetImportance: toggle(events.planetImportance, value) })} />
            </div>
          </details>
          <p className="mt-4 text-[11px] text-white/30">Часовой пояс доставки: {events.timezone}. Push-канал пока не подключён. {saving === "events" ? "Сохраняем…" : ""}</p>
        </section> : null}
      </div>
    </section>
  </div>;
}

function PreferenceCheckbox({ checked, disabled, onChange, label, description }: {
  checked: boolean; disabled: boolean; onChange: (value: boolean) => void; label: string; description?: string;
}) {
  return <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
    <input type="checkbox" className="mt-1 accent-amber-300" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span><span className="block text-sm text-white/75">{label}</span>{description ? <span className="mt-1 block text-xs leading-5 text-white/40">{description}</span> : null}</span>
  </label>;
}

function CheckboxGroup<T extends string | number>({ title, values, selected, label, onToggle }: {
  title: string; values: readonly T[]; selected: readonly T[]; label: (value: T) => string; onToggle: (value: T) => void;
}) {
  return <fieldset><legend className="text-xs text-white/45">{title}</legend><div className="mt-2 flex flex-wrap gap-2">
    {values.map((value) => <label key={value} className="flex min-h-10 items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-white/55">
      <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} /> {label(value)}
    </label>)}
  </div></fieldset>;
}

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
