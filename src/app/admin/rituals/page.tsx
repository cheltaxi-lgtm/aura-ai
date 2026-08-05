"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminBtn, AdminTitle } from "@/components/admin/AdminShell";
import type { RitualSettings } from "@/lib/ritual-settings";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import type { RitualAdminListItem, RitualAdminStats } from "@/lib/ritual-service";

interface CatalogEntry {
  key: RitualType;
  label: string;
  emoji: string;
  desc: string;
  defaultCost: number;
}

const STATUS_LABEL: Record<string, string> = {
  questions: "Вопросы",
  spread: "Расклад",
  payment: "Оплата",
  generating: "Генерация",
  completed: "Готово",
  reviewed: "Отзыв",
};

export default function AdminRitualsPage() {
  const [settings, setSettings] = useState<RitualSettings | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [stats, setStats] = useState<RitualAdminStats | null>(null);
  const [recent, setRecent] = useState<RitualAdminListItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/rituals")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings ?? null);
        setCatalog(d.catalog ?? []);
        setStats(d.stats ?? null);
        setRecent(d.recent ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const updateType = (key: RitualType, patch: { enabled?: boolean; cost?: number }) => {
    if (!settings) return;
    setSettings({
      ...settings,
      types: {
        ...settings.types,
        [key]: { ...settings.types[key], ...patch },
      },
    });
  };

  const save = async () => {
    if (!settings) return;
    const { adminFetch } = await import("@/lib/admin-fetch");
    const res = await adminFetch("/api/admin/rituals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const data = await res.json();
    if (data.settings) setSettings(data.settings);
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
        title="Обряды"
        subtitle="Каталог, цены, воронка и последние заказы"
      />

      <div className="grid max-w-5xl gap-6">
        <div className="glass-panel flex flex-wrap items-center justify-between gap-4 p-6">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.enabled !== false}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="h-4 w-4 accent-aura-gold"
            />
            <span className="text-gray-200">Обряды включены глобально</span>
          </label>
          <div className="flex items-center gap-4">
            <AdminBtn onClick={() => void save()}>Сохранить</AdminBtn>
            {saved && <span className="text-sm text-aura-emerald">Сохранено</span>}
          </div>
        </div>

        {stats && (
          <div className="glass-panel grid grid-cols-2 gap-4 p-6 sm:grid-cols-4 lg:grid-cols-7">
            <Stat label="Всего" value={stats.total} />
            <Stat label="Готово+отзыв" value={stats.byStatus.completed + stats.byStatus.reviewed} />
            <Stat label="Конверсия" value={`${stats.completionRate}%`} />
            <Stat label="Отзывы" value={`${stats.reviewRate}%`} />
            <Stat label="Застряли" value={stats.stuckGenerating} />
            <Stat label="Free/unlimited" value={stats.freeShare} />
            <Stat label="На оплате" value={stats.byStatus.payment} />
          </div>
        )}

        <div className="glass-panel overflow-x-auto p-6">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-gray-500">
                <th className="pb-3 pr-4 font-medium">Обряд</th>
                <th className="pb-3 pr-4 font-medium">Включён</th>
                <th className="pb-3 font-medium">Цена, ᚢ</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((entry) => {
                const cfg = settings.types[entry.key] ?? {
                  enabled: true,
                  cost: entry.defaultCost,
                };
                return (
                  <tr key={entry.key} className="border-b border-white/5">
                    <td className="py-3 pr-4">
                      <p className="text-gray-200">
                        {entry.emoji} {entry.label}
                      </p>
                      <p className="mt-0.5 max-w-xs text-xs text-gray-500">{entry.desc}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={(e) => updateType(entry.key, { enabled: e.target.checked })}
                        className="h-4 w-4 accent-aura-gold"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        value={cfg.cost}
                        onChange={(e) =>
                          updateType(entry.key, {
                            cost: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="glass-panel overflow-x-auto p-6">
          <p className="mb-4 text-sm font-medium text-gray-300">Последние обряды</p>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-gray-500">
                <th className="pb-3 pr-4 font-medium">Тип</th>
                <th className="pb-3 pr-4 font-medium">Мастер</th>
                <th className="pb-3 pr-4 font-medium">Статус</th>
                <th className="pb-3 pr-4 font-medium">Оплата</th>
                <th className="pb-3 pr-4 font-medium">ᚢ</th>
                <th className="pb-3 font-medium">Создано</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-gray-200">
                    {RITUAL_TYPES[item.ritualType]?.emoji}{" "}
                    {RITUAL_TYPES[item.ritualType]?.label ?? item.ritualType}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{item.characterKey}</td>
                  <td className="py-3 pr-4 text-gray-400">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">{item.paymentStatus}</td>
                  <td className="py-3 pr-4 text-gray-500">{item.runeCost}</td>
                  <td className="py-3 text-gray-500">
                    {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Пока нет ни одного обряда
                  </td>
                </tr>
              ) : null}
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-100">{value}</p>
    </div>
  );
}
