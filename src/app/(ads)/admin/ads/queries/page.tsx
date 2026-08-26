"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn } from "@/components/admin/AdminShell";
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
  previous_position: string | number | null;
  delta: string | number | null;
  organic_traffic: number | null;
  opportunity_score: number;
  status: string;
};

function n(v: string | number | null | undefined, d = 1): string {
  if (v == null || v === "") return "—";
  const x = Number(v);
  return Number.isFinite(x) ? x.toFixed(d) : "—";
}

export default function AdsQueriesPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/ads/admin/organic");
      const d = (await r.json()) as { ok?: boolean; error?: string; items?: Row[] };
      if (!r.ok || d.ok === false) {
        setError(d.error || `HTTP ${r.status}`);
        return;
      }
      setItems(d.items ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (query: string, status: string) => {
    setBusy(query);
    try {
      const r = await fetch("/api/ads/admin/organic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, status }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) setError(d.error || `HTTP ${r.status}`);
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminShell>
      <AdminTitle
        title="Запросы"
        subtitle="органический реестр Webmaster + Wordstat + Метрика"
      />
      <AdsAdminNav />
      <AdsErrorBanner error={error} />
      <AdminTable
        headers={[
          "Query",
          "Cluster",
          "URL",
          "Freq",
          "Shows",
          "Clicks",
          "CTR",
          "Pos",
          "Prev",
          "Δ",
          "Org",
          "Score",
          "Status",
        ]}
        rows={items.map((r) => [
          r.query,
          r.cluster || "—",
          r.target_url || "—",
          r.frequency != null ? String(r.frequency) : "—",
          String(r.impressions),
          String(r.clicks),
          n(r.ctr, 3),
          n(r.current_position, 1),
          n(r.previous_position, 1),
          n(r.delta, 1),
          r.organic_traffic != null ? String(r.organic_traffic) : "—",
          String(r.opportunity_score),
          <span key="st" className="flex flex-wrap gap-1">
            <span>{r.status}</span>
            {["WATCH", "PUSH", "PROTECT", "EXPAND", "IGNORE"].map((s) => (
              <AdminBtn
                key={s}
                disabled={busy === r.query || r.status === s}
                onClick={() => void setStatus(r.query, s)}
              >
                {s}
              </AdminBtn>
            ))}
          </span>,
        ])}
      />
    </AdminShell>
  );
}
