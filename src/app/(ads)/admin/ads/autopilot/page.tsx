"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";

type RuleRow = {
  id: string;
  rule: string;
  target_level: string | null;
  target_id: string | null;
  decision: string;
  reason_json: unknown;
  applied: boolean;
  created_at: string;
};

export default function AdsAutopilotPage() {
  const [items, setItems] = useState<RuleRow[]>([]);
  const [rulesMode, setRulesMode] = useState("dry_run");
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ads/admin/rules")
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
        setItems(d.items ?? []);
        setRulesMode(d.rulesMode ?? "dry_run");
        setThresholds(d.thresholds ?? {});
      })
      .catch((e) => setError(e instanceof Error ? e.message : "network"));
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle
        title="Автопилот"
        subtitle="существующий движок правил D*/K*/S1 · dry_run vs apply · здоровье: /admin/ads/health"
      />
      <AdsAdminNav />
      <AdsErrorBanner error={error} />
      <p className="mb-4 text-xs text-gray-500">
        <Link href="/admin/ads/health" className="text-aura-gold underline">
          Журнал last_run cron-задач
        </Link>
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Режим правил"
          value={rulesMode}
          accent={rulesMode === "apply" ? "text-aura-emerald" : "text-amber-400"}
        />
        <StatCard label="Daily cap" value={thresholds.discovery_daily_cap_rub ?? "—"} />
        <StatCard label="Max CPA reg" value={thresholds.discovery_max_cpa_reg_rub ?? "—"} />
        <StatCard label="Global daily" value={thresholds.global_daily_cap_rub ?? "—"} />
      </div>

      <div className="glass-panel mb-6 grid gap-2 p-4 text-xs text-gray-400 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(thresholds).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-white/5 py-1">
            <span>{k}</span>
            <span className="text-aura-gold">{v}</span>
          </div>
        ))}
      </div>

      <AdminTable
        headers={["Время", "Правило", "Решение", "Applied", "Target", "Reason"]}
        rows={items.map((r) => [
          new Date(r.created_at).toLocaleString("ru-RU"),
          r.rule,
          r.decision,
          r.applied ? (
            <span className="text-aura-emerald">yes</span>
          ) : (
            <span className="text-gray-600">dry</span>
          ),
          r.target_id ? `${r.target_level}:${r.target_id}` : "—",
          <span key="j" className="max-w-[240px] truncate text-xs text-gray-500">
            {JSON.stringify(r.reason_json)}
          </span>,
        ])}
      />
    </AdminShell>
  );
}
