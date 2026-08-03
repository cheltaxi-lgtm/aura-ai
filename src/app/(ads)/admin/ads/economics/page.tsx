"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

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

  useEffect(() => {
    fetch("/api/ads/admin/economics")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        setLatest(d.latest);
        setHistory(d.history ?? []);
      })
      .catch(() => {});
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle title="Экономика" subtitle="Когорта 30 дней · ARPU / CR / допустимый CPA" />
      <AdsAdminNav />

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
              : latest?.cpaNote ?? "—"
          }
          accent={latest?.applyMaxAllowedCpa ? "text-aura-emerald" : "text-amber-400"}
        />
        <StatCard label="Sample" value={latest?.sampleSize ?? "—"} />
        <StatCard label="Confidence" value={latest?.confidence ?? "—"} />
      </div>

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
