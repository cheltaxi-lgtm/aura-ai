"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

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

export default function AdsRulesPage() {
  const [items, setItems] = useState<RuleRow[]>([]);
  const [rulesMode, setRulesMode] = useState("dry_run");
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    fetch("/api/ads/admin/rules")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        setItems(d.items ?? []);
        setRulesMode(d.rulesMode ?? "dry_run");
        setThresholds(d.thresholds ?? {});
      })
      .catch(() => {});
  }, []);

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle title="Правила" subtitle="Журнал решений D*/K* · dry_run vs applied" />
      <AdsAdminNav />

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
