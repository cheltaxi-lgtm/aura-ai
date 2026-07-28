"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type FunnelRow = {
  key: string;
  label: string;
  value: number;
  cr: number | null;
  sampleSmall: boolean;
};

type Overview = {
  mode: string;
  spent: number;
  visits: number;
  registrations: number;
  targetRegistrations: number;
  progressPct: number;
  funnel: FunnelRow[];
  worstStep: string | null;
  insights: { step: string; value: number; cr: number | null; note: string | null }[];
};

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function AdsOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void Promise.all([
      fetch("/api/ads/admin/overview").then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        setData(await r.json());
      }),
      fetch("/api/ads/admin/approvals").then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        setPending(d.pending ?? 0);
      }),
    ]);
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle
        title="Реклама"
        subtitle={
          data?.mode === "discovery"
            ? "Discovery: расход, визиты, регистрации · ROMI скрыт"
            : "Ads Autopilot"
        }
      />
      <AdsAdminNav pendingApprovals={pending} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Расход, ₽" value={data ? Math.round(data.spent) : "—"} accent="text-aura-gold" />
        <StatCard label="Визиты" value={data?.visits ?? "—"} />
        <StatCard label="Регистрации" value={data?.registrations ?? "—"} accent="text-aura-emerald" />
        <StatCard
          label={`Прогресс до ${data?.targetRegistrations ?? 100}`}
          value={data ? `${data.progressPct}%` : "—"}
          accent="text-aura-gold"
        />
      </div>

      {data && (
        <div className="glass-panel mb-6 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>Цель discovery</span>
            <span className="text-aura-gold">
              {data.registrations} / {data.targetRegistrations}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-aura-gold/80 transition-all"
              style={{ width: `${Math.min(100, data.progressPct)}%` }}
            />
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-white">Воронка</h2>
      <AdminTable
        headers={["Шаг", "Кол-во", "CR от предыдущего", ""]}
        rows={(data?.funnel ?? []).map((s) => [
          s.label,
          String(s.value),
          pct(s.cr),
          data?.worstStep === s.key ? (
            <span className="text-amber-400">худший переход</span>
          ) : s.sampleSmall ? (
            <span className="text-gray-600">выборка мала</span>
          ) : (
            ""
          ),
        ])}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Что мы узнали</h2>
      <div className="glass-panel space-y-2 p-4">
        {(data?.insights ?? []).length === 0 ? (
          <p className="text-sm text-gray-600">Пока нет данных воронки</p>
        ) : (
          (data?.insights ?? []).map((ins) => (
            <div key={ins.step} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-gray-300">{ins.step}</span>
              <span className="text-gray-500">
                n={ins.value}
                {ins.cr != null ? ` · CR ${pct(ins.cr)}` : ""}
                {ins.note ? (
                  <span className="ml-2 text-amber-500/80">({ins.note})</span>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}
