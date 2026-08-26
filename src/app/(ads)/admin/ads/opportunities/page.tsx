"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";

type Row = {
  query: string;
  cluster: string | null;
  target_url: string | null;
  frequency: number | null;
  impressions: number;
  clicks: number;
  ctr: string | number | null;
  current_position: string | number | null;
  opportunity_score: number;
  status: string;
  wordstat_rising?: boolean;
  landing_match?: boolean;
};

function n(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(1) : "—";
}

export default function AdsOpportunitiesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/ads/admin/organic");
      const d = (await r.json()) as { ok?: boolean; error?: string; items?: Row[] };
      if (!r.ok || d.ok === false) {
        setError(d.error || `HTTP ${r.status}`);
        return;
      }
      setItems((d.items ?? []).filter((x) => x.status === "PUSH" || x.status === "EXPAND" || x.opportunity_score >= 40));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const push = items.filter((i) => i.status === "PUSH").length;
  const expand = items.filter((i) => i.status === "EXPAND").length;

  return (
    <AdminShell>
      <AdminTitle
        title="Возможности"
        subtitle="Opportunity Score · PUSH / EXPAND / высокая оценка"
      />
      <AdsAdminNav />
      <AdsErrorBanner error={error} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="PUSH" value={push} accent="text-aura-gold" />
        <StatCard label="EXPAND" value={expand} />
        <StatCard label="В выборке" value={items.length} />
      </div>
      <AdminTable
        headers={["Query", "Score", "Status", "Pos", "Shows", "CTR", "Freq", "Landing", "↑WS"]}
        rows={items.map((r) => [
          r.query,
          String(r.opportunity_score),
          r.status,
          n(r.current_position),
          String(r.impressions),
          n(r.ctr),
          r.frequency != null ? String(r.frequency) : "—",
          r.target_url || "нет (не создаём thin page)",
          r.wordstat_rising ? "да" : "—",
        ])}
      />
    </AdminShell>
  );
}
