"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, StatCard } from "@/components/admin/AdminShell";

export default function AdminDashboardPage() {
  const [data, setData] = useState<{
    stats: Record<string, number>;
    chart: { day: string; count: string; total: string }[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const s = data?.stats;

  return (
    <AdminShell>
      <AdminTitle title="Дашборд" subtitle="Обзор портала Zovus" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Аккаунты" value={s?.users ?? "—"} />
        <StatCard label="Профили онбординга" value={s?.profiles ?? "—"} />
        <StatCard label="Эзотерики" value={s?.experts ?? "—"} />
        <StatCard label="Сессии" value={s?.sessions ?? "—"} />
        <StatCard label="Сообщений в чате" value={s?.messages ?? "—"} />
        <StatCard label="Успешных оплат" value={s?.paymentsOk ?? "—"} accent="text-aura-emerald" />
        <StatCard label="Выручка, ₽" value={s?.revenue?.toFixed(0) ?? "—"} accent="text-aura-gold" />
        <StatCard label="Инфлюенсеры" value={s?.influencers ?? "—"} />
        <StatCard label="Поддержка (открытых)" value={s?.supportOpen ?? "—"} accent="text-amber-300" />
        <StatCard label="Поддержка (непрочит.)" value={s?.supportUnread ?? "—"} accent="text-aura-neon" />
      </div>

      {data?.chart && data.chart.length > 0 && (
        <div className="mt-8 glass-panel p-6">
          <h2 className="font-display mb-4 text-lg text-white">Оплаты за 30 дней</h2>
          <div className="space-y-2">
            {data.chart.map((row) => (
              <div key={row.day} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{row.day}</span>
                <span className="text-gray-300">
                  {row.count} оплат · {parseFloat(row.total).toFixed(0)} ₽
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
