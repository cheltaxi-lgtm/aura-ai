"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminBtn, AdminTitle } from "@/components/admin/AdminShell";
import {
  DEFAULT_RUNE_COSTS,
  RUNE_ACTION_DESCRIPTIONS,
  RUNE_ACTION_LABELS,
  type RuneActionType,
} from "@/lib/rune-costs";
import type { RuneSettings } from "@/lib/rune-settings";

interface RunePackage {
  id: string;
  name: string;
  runes: number;
  price_rub: number;
  bonus_runes: number;
  is_popular: boolean;
  sort_order: number;
}

const ACTION_KEYS = Object.keys(DEFAULT_RUNE_COSTS) as RuneActionType[];

export default function AdminRunesPage() {
  const [settings, setSettings] = useState<RuneSettings | null>(null);
  const [packages, setPackages] = useState<RunePackage[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/runes")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings ?? null);
        setPackages(d.packages ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateCost = (action: RuneActionType, value: number) => {
    if (!settings) return;
    setSettings({
      ...settings,
      costs: { ...settings.costs, [action]: Math.max(0, Math.round(value)) },
    });
  };

  const updatePackage = (index: number, patch: Partial<RunePackage>) => {
    setPackages((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const recalculatePackagesByRate = () => {
    if (!settings || settings.rubPerRune <= 0) return;
    const rate = settings.rubPerRune;
    const ok = window.confirm(
      `Пересчитать цены пакетов по курсу ${rate} ₽/ᚢ?\n` +
        `Формула: (руны + бонус) × курс. Текущие цены в ₽ будут заменены.`
    );
    if (!ok) return;
    setPackages((prev) =>
      prev.map((pkg) => {
        const total = pkg.runes + pkg.bonus_runes;
        return {
          ...pkg,
          price_rub: Math.max(1, Math.round(total * rate)),
        };
      })
    );
  };

  const save = async () => {
    if (!settings) return;
    const { adminFetch } = await import("@/lib/admin-fetch");
    const res = await adminFetch("/api/admin/runes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, packages }),
    });
    const data = await res.json();
    if (data.settings) setSettings(data.settings);
    if (data.packages) setPackages(data.packages);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !settings) {
    return (
      <AdminShell>
        <p className="text-gray-500">Загрузка…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <AdminTitle
        title="Руны"
        subtitle="Курс, стартовый пакет, цены услуг и пакеты в магазине"
      />

      <div className="grid max-w-4xl gap-6">
        <div className="glass-panel space-y-4 p-6">
          <h2 className="font-display text-lg text-white">Экономика</h2>

          <label className="flex cursor-pointer items-center justify-between">
            <span className="text-sm text-gray-300">Оплата рунами включена</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="h-4 w-4 accent-aura-purple"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Курс: ₽ за 1 руну</label>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={settings.rubPerRune}
                onChange={(e) =>
                  setSettings({ ...settings, rubPerRune: parseFloat(e.target.value) || 0 })
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
              <p className="mt-1 text-[10px] text-gray-600">Справочно для UI и сравнения с ₽</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Стартовый пакет, ᚢ</label>
              <input
                type="number"
                min={0}
                value={settings.starterRunes}
                onChange={(e) =>
                  setSettings({ ...settings, starterRunes: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
              <p className="mt-1 text-[10px] text-gray-600">Один раз при создании профиля</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Бесплатных вопросов в чате</label>
              <input
                type="number"
                min={0}
                max={20}
                value={settings.freeQuestions}
                onChange={(e) =>
                  setSettings({ ...settings, freeQuestions: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>
        </div>

        <div className="glass-panel overflow-x-auto p-6">
          <h2 className="mb-4 font-display text-lg text-white">Стоимость услуг (ᚢ)</h2>
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-gray-500">
                <th className="pb-3 pr-4 font-medium">Услуга</th>
                <th className="pb-3 pr-4 font-medium">Описание</th>
                <th className="pb-3 font-medium">Цена</th>
              </tr>
            </thead>
            <tbody>
              {ACTION_KEYS.map((action) => (
                <tr key={action} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-gray-200">{RUNE_ACTION_LABELS[action]}</td>
                  <td className="py-3 pr-4 text-xs text-gray-500">
                    {RUNE_ACTION_DESCRIPTIONS[action]}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={settings.costs[action] ?? 0}
                        onChange={(e) => updateCost(action, parseInt(e.target.value, 10) || 0)}
                        className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                      />
                      <span className="text-gray-500">ᚢ</span>
                      <span className="text-xs text-gray-600">
                        ≈ {Math.round((settings.costs[action] ?? 0) * settings.rubPerRune)} ₽
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-panel overflow-x-auto p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg text-white">Пакеты в магазине</h2>
            <button
              type="button"
              onClick={recalculatePackagesByRate}
              className="rounded-lg border border-aura-purple/40 px-3 py-1.5 text-xs font-medium text-aura-neon transition-colors hover:bg-aura-purple/10"
            >
              Пересчитать ₽ по курсу
            </button>
          </div>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-gray-500">
                <th className="pb-3 pr-3 font-medium">ID</th>
                <th className="pb-3 pr-3 font-medium">Название</th>
                <th className="pb-3 pr-3 font-medium">Руны</th>
                <th className="pb-3 pr-3 font-medium">Бонус</th>
                <th className="pb-3 pr-3 font-medium">₽</th>
                <th className="pb-3 pr-3 font-medium">₽/руна</th>
                <th className="pb-3 pr-3 font-medium">Хит</th>
                <th className="pb-3 font-medium">Порядок</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg, i) => {
                const total = pkg.runes + pkg.bonus_runes;
                const perRune = total > 0 ? (pkg.price_rub / total).toFixed(2) : "—";
                return (
                  <tr key={pkg.id} className="border-b border-white/5">
                    <td className="py-2 pr-3 font-mono text-xs text-gray-500">{pkg.id}</td>
                    <td className="py-2 pr-3">
                      <input
                        value={pkg.name}
                        onChange={(e) => updatePackage(i, { name: e.target.value })}
                        className="w-full min-w-[100px] rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={1}
                        value={pkg.runes}
                        onChange={(e) =>
                          updatePackage(i, { runes: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={0}
                        value={pkg.bonus_runes}
                        onChange={(e) =>
                          updatePackage(i, { bonus_runes: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        min={1}
                        value={pkg.price_rub}
                        onChange={(e) =>
                          updatePackage(i, { price_rub: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-20 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                      />
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500">{perRune}</td>
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={pkg.is_popular}
                        onChange={(e) => updatePackage(i, { is_popular: e.target.checked })}
                        className="h-4 w-4 accent-aura-purple"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        value={pkg.sort_order}
                        onChange={(e) =>
                          updatePackage(i, { sort_order: parseInt(e.target.value, 10) || 0 })
                        }
                        className="w-14 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-4">
          <AdminBtn onClick={() => void save()}>Сохранить</AdminBtn>
          {saved && <span className="text-sm text-aura-emerald">Сохранено</span>}
        </div>
      </div>
    </AdminShell>
  );
}
