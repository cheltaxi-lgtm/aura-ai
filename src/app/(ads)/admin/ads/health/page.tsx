"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";

type Health = {
  checks: {
    target: string;
    kind: string;
    status_code: number | null;
    latency_ms: number | null;
    ok: boolean;
    checked_at: string;
  }[];
  checksError?: string | null;
  statsHours: number | null;
  metrikaHours: number | null;
  failStreak: number;
  guards: Record<string, string>;
  budget: { spentRub: number; hardTotalRub: number; pct: number };
  jobs?: {
    id: string;
    schedule: string;
    access: string;
    last_run: string | null;
    last_success: string | null;
    last_error: string | null;
    duration_ms: number | null;
    last_ok: boolean | null;
  }[];
};

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU");
}

export default function AdsHealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ads/admin/health")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setLoadError(j.error || `HTTP ${r.status}`);
          return;
        }
        setData(await r.json());
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "network"));
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle
        title="Здоровье"
        subtitle="cron jobs · health_check · свежесть · защиты B1–B7"
      />
      <AdsAdminNav />
      <AdsErrorBanner error={loadError || data?.checksError} />

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

      <h2 className="mb-3 text-sm font-semibold text-white">Ads jobs (last_run)</h2>
      <AdminTable
        headers={["Job", "Cron UTC", "Access", "Last run", "Last success", "ms", "OK", "Error"]}
        rows={(data?.jobs ?? []).map((j) => [
          j.id,
          j.schedule,
          j.access,
          fmtTs(j.last_run),
          fmtTs(j.last_success),
          j.duration_ms != null ? String(j.duration_ms) : "—",
          j.last_ok == null ? "—" : j.last_ok ? "✓" : "✗",
          j.last_error ? <span className="text-red-400">{j.last_error}</span> : "—",
        ])}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Защиты B1–B7</h2>
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
