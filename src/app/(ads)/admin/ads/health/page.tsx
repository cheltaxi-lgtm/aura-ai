"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Health = {
  checks: {
    target: string;
    kind: string;
    status_code: number | null;
    latency_ms: number | null;
    ok: boolean;
    checked_at: string;
  }[];
  statsHours: number | null;
  metrikaHours: number | null;
  failStreak: number;
  guards: Record<string, string>;
  budget: { spentRub: number; hardTotalRub: number; pct: number };
};

export default function AdsHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    fetch("/api/ads/admin/health")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        setData(await r.json());
      })
      .catch(() => {});
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle
        title="Здоровье"
        subtitle="health_check · свежесть статистики · статус защит B1–B7"
      />
      <AdsAdminNav />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Расход / лимит"
          value={`${Math.round(data?.budget.spentRub ?? 0)} / ${data?.budget.hardTotalRub ?? 9000}`}
          accent={(data?.budget.pct ?? 0) >= 90 ? "text-red-400" : "text-aura-gold"}
        />
        <StatCard
          label="Stats age, ч"
          value={data?.statsHours != null ? data.statsHours.toFixed(1) : "—"}
        />
        <StatCard
          label="Metrika age, ч"
          value={data?.metrikaHours != null ? data.metrikaHours.toFixed(1) : "—"}
        />
        <StatCard
          label="sync-stats fail streak"
          value={data?.failStreak ?? 0}
          accent={(data?.failStreak ?? 0) >= 3 ? "text-red-400" : undefined}
        />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-white">Защиты B1–B7</h2>
      <AdminTable
        headers={["Защита", "Статус"]}
        rows={Object.entries(data?.guards ?? {}).map(([k, v]) => [
          k,
          v === "fired" ? (
            <span className="text-amber-400">сработала</span>
          ) : (
            <span className="text-aura-emerald">активна</span>
          ),
        ])}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Последние health_check</h2>
      <AdminTable
        headers={["Kind", "Target", "HTTP", "Latency", "OK", "Когда"]}
        rows={(data?.checks ?? []).map((c) => [
          c.kind,
          c.target,
          c.status_code != null ? String(c.status_code) : "—",
          c.latency_ms != null ? `${c.latency_ms}ms` : "—",
          c.ok ? "✓" : "✗",
          new Date(c.checked_at).toLocaleString("ru-RU"),
        ])}
      />
    </AdminShell>
  );
}
