"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminBtn, AdminTitle } from "@/components/admin/AdminShell";
import type { RitualSettings } from "@/lib/ritual-settings";
import type { RitualType } from "@/lib/ritual-config";

interface CatalogEntry {
  key: RitualType;
  label: string;
  emoji: string;
  desc: string;
  defaultCost: number;
}

export default function AdminRitualsPage() {
  const [settings, setSettings] = useState<RitualSettings | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/rituals")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings ?? null);
        setCatalog(d.catalog ?? []);
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
    const res = await fetch("/api/admin/rituals", {
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
        subtitle="Включение/отключение типов обряда и цена без деплоя"
      />

      <div className="grid max-w-4xl gap-6">
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
                        className="h-4 w-4 accent-aura-purple"
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

        <div className="flex items-center gap-4">
          <AdminBtn onClick={() => void save()}>Сохранить</AdminBtn>
          {saved && <span className="text-sm text-aura-emerald">Сохранено</span>}
        </div>
      </div>
    </AdminShell>
  );
}
