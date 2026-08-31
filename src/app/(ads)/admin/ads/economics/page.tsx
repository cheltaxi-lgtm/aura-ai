"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";
import { MultiLineChart } from "@/modules/ads/admin/AdminCharts";

type Latest = {
  date: string;
  registrations: number;
  payers: number;
  revenueRub: number;
  arpu30: number | null;
  crRegToPayer: number | null;
  avgCheckRub: number | null;
  maxAllowedCpaRegRub: number | null;
  sampleSize: number;
  confidence: string;
  applyMaxAllowedCpa: boolean;
  cpaNote: string | null;
};

export default function AdsEconomicsPage() {
  const [latest, setLatest] = useState<Latest | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ads/admin/economics")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          setError(d.error || `HTTP ${r.status}`);
          return;
        }
        const d = await r.json();
        setLatest(d.latest);
        setHistory(d.history ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "network"));
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle title="Экономика" subtitle="Когорта 30 дней · ARPU / CR / допустимый CPA" />
      <AdsAdminNav />
      <AdsErrorBanner error={error} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="ARPU30, ₽"
          value={latest?.arpu30 != null ? latest.arpu30.toFixed(0) : "—"}
          accent="text-aura-gold"
        />
        <StatCard
          label="CR reg→payer"
          value={
            latest?.crRegToPayer != null
              ? `${(latest.crRegToPayer * 100).toFixed(1)}%`
              : "—"
          }
        />
        <StatCard
          label="Средний чек, ₽"
          value={latest?.avgCheckRub != null ? latest.avgCheckRub.toFixed(0) : "—"}
        />
        <StatCard
          label="Допустимый CPA, ₽"
          value={
            latest?.applyMaxAllowedCpa && latest.maxAllowedCpaRegRub != null
              ? latest.maxAllowedCpaRegRub.toFixed(0)
              : "—"
          }
          accent={latest?.applyMaxAllowedCpa ? "text-aura-emerald" : "text-amber-400"}
        />
        <StatCard label="Sample" value={latest?.sampleSize ?? "—"} />
        <StatCard label="Confidence" value={latest?.confidence ?? "—"} />
      </div>

      {!latest && !error && !disabled ? (
        <p className="mb-4 text-sm text-amber-400/90">Выборка пустая — economics_snapshot ещё нет данных.</p>
      ) : null}

      {history.length > 1 ? (
        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <div className="glass-panel p-4">
            <h3 className="mb-2 text-xs font-semibold text-gray-400">Выручка и ARPU30 по дням</h3>
            <MultiLineChart
              points={[...history]
                .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                .map((h) => ({
                  date: String(h.date).slice(0, 10),
                  revenue: Number(h.revenue_rub) || 0,
                  arpu: Number(h.arpu_per_registration_rub) || 0,
                }))}
              series={[
                { key: "revenue", label: "Выручка, ₽", color: "rgba(212,175,55,0.9)", labels: "stride" },
                { key: "arpu", label: "ARPU30, ₽", color: "rgba(52,211,153,0.9)", labels: "last", labelPos: "below" },
              ]}
            />
          </div>
          <div className="glass-panel p-4">
            <h3 className="mb-2 text-xs font-semibold text-gray-400">CR reg→payer по дням</h3>
            <MultiLineChart
              points={[...history]
                .sort((a, b) => String(a.date).localeCompare(String(b.date)))
                .map((h) => ({
                  date: String(h.date).slice(0, 10),
                  cr: (Number(h.cr_reg_to_payer) || 0) * 100,
                }))}
              series={[
                {
                  key: "cr",
                  label: "CR reg→payer",
                  color: "rgba(96,165,250,0.9)",
                  labels: "stride",
                  format: (v) => `${v.toFixed(1)}%`,
                },
              ]}
            />
          </div>
        </div>
      ) : null}
      {!latest?.applyMaxAllowedCpa && latest && (
        <p className="mb-4 text-sm text-amber-400/90">
          sample_size &lt; 100 — порог CPA не применяется ({latest.cpaNote}).
        </p>
      )}

      <AdminTable
        headers={["Дата", "Reg", "Payers", "Revenue", "ARPU", "Confidence"]}
        rows={history.map((h) => [
          String(h.date),
          String(h.registrations),
          String(h.payers),
          `${h.revenue_rub} ₽`,
          h.arpu_per_registration_rub != null ? String(h.arpu_per_registration_rub) : "—",
          String(h.confidence),
        ])}
      />
    </AdminShell>
  );
}
