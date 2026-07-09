"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminBtn, AdminTitle } from "@/components/admin/AdminShell";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";

interface JointReadingSettings {
  enabled: boolean;
}

interface JointReadingStats {
  total: number;
  byStatus: Record<"pending_partner" | "partner_done" | "completed" | "expired", number>;
  completionRate: number;
}

interface JointReadingListItem {
  id: string;
  token: string;
  initiatorName: string | null;
  partnerName: string | null;
  intentSlug: string;
  status: "pending_partner" | "partner_done" | "completed" | "expired";
  createdAt: string;
  expiresAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_partner: "Ждём партнёра",
  partner_done: "Ждёт инициатора",
  completed: "Готово",
  expired: "Истекло",
};

export default function AdminJointReadingsPage() {
  const [settings, setSettings] = useState<JointReadingSettings | null>(null);
  const [stats, setStats] = useState<JointReadingStats | null>(null);
  const [recent, setRecent] = useState<JointReadingListItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/joint-readings")
      .then((r) => r.json())
      .then((d) => {
        setSettings(d.settings ?? null);
        setStats(d.stats ?? null);
        setRecent(d.recent ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!settings) return;
    const res = await fetch("/api/admin/joint-readings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    const data = await res.json();
    if (data.settings) setSettings(data.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !settings || !stats) {
    return (
      <AdminShell>
        <p className="text-gray-500">Загрузка…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <AdminTitle
        title="Совместные расклады"
        subtitle="Включение фичи, конверсия и последние приглашения"
      />

      <div className="grid max-w-5xl gap-6">
        <div className="glass-panel flex flex-wrap items-center justify-between gap-4 p-6">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
              className="h-4 w-4 accent-aura-purple"
            />
            <span className="text-gray-200">Совместные расклады включены</span>
          </label>
          <div className="flex items-center gap-4">
            <AdminBtn onClick={() => void save()}>Сохранить</AdminBtn>
            {saved && <span className="text-sm text-aura-emerald">Сохранено</span>}
          </div>
        </div>

        <div className="glass-panel grid grid-cols-2 gap-4 p-6 sm:grid-cols-5">
          <Stat label="Всего" value={stats.total} />
          <Stat label="Ждут партнёра" value={stats.byStatus.pending_partner} />
          <Stat label="Ждут инициатора" value={stats.byStatus.partner_done} />
          <Stat label="Готово" value={stats.byStatus.completed} />
          <Stat label="Конверсия" value={`${stats.completionRate}%`} />
        </div>

        <div className="glass-panel overflow-x-auto p-6">
          <p className="mb-4 text-sm font-medium text-gray-300">Последние приглашения</p>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-gray-500">
                <th className="pb-3 pr-4 font-medium">Инициатор → Партнёр</th>
                <th className="pb-3 pr-4 font-medium">Тема</th>
                <th className="pb-3 pr-4 font-medium">Статус</th>
                <th className="pb-3 pr-4 font-medium">Создано</th>
                <th className="pb-3 font-medium">Истекает</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((item) => (
                <tr key={item.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 text-gray-200">
                    <a
                      href={`/joint-reading/${item.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-aura-gold hover:underline"
                    >
                      {item.initiatorName ?? "—"} → {item.partnerName ?? "—"}
                    </a>
                  </td>
                  <td className="py-3 pr-4 text-gray-400">
                    {getSpreadIntentBySlug(item.intentSlug)?.title ?? item.intentSlug}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </td>
                  <td className="py-3 pr-4 text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString("ru-RU")}
                  </td>
                  <td className="py-3 text-gray-500">
                    {new Date(item.expiresAt).toLocaleDateString("ru-RU")}
                  </td>
                </tr>
              ))}
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    Пока нет ни одного приглашения
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}
