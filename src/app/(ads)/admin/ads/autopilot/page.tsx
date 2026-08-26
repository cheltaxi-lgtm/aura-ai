"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";
import DirectStatusCard from "@/modules/ads/admin/DirectStatusCard";

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

type JobRow = {
  id: string;
  last_run: string | null;
  last_ok: boolean | null;
  last_error: string | null;
};

function ruleBucket(rule: string): "guard" | "discovery" | "seo" | "other" {
  if (/^[KB]\d/i.test(rule)) return "guard";
  if (/^[DR]\d/i.test(rule)) return "discovery";
  if (/^S\d/i.test(rule) || rule.toLowerCase().startsWith("seo")) return "seo";
  return "other";
}

export default function AdsAutopilotPage() {
  const [items, setItems] = useState<RuleRow[]>([]);
  const [rulesMode, setRulesMode] = useState("dry_run");
  const [thresholds, setThresholds] = useState<Record<string, number>>({});
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [organic, setOrganic] = useState<{
    overrides_applied: number | null;
    experiments_pending: number | null;
  } | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch("/api/ads/admin/rules").then(async (r) => {
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
      }),
      fetch("/api/ads/admin/approvals").then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        setPending(d.pending ?? 0);
      }),
      fetch("/api/ads/admin/diagnostics").then(async (r) => {
        if (!r.ok) return;
        const d = (await r.json()) as {
          jobs?: JobRow[];
          organic?: { overrides_applied: number | null; experiments_pending: number | null };
        };
        setJobs(d.jobs ?? []);
        setOrganic(d.organic ?? null);
      }),
    ]).catch((e) => setError(e instanceof Error ? e.message : "network"));
  }, []);

  if (disabled) return <AdsDisabled />;

  const guard = items.filter((r) => ruleBucket(r.rule) === "guard");
  const discovery = items.filter((r) => ruleBucket(r.rule) === "discovery");
  const seo = items.filter((r) => ruleBucket(r.rule) === "seo");

  const renderRows = (rows: RuleRow[]) =>
    rows.slice(0, 40).map((r) => [
      new Date(r.created_at).toLocaleString("ru-RU"),
      r.rule,
      r.decision,
      r.applied ? (
        <span className="text-aura-emerald">yes</span>
      ) : (
        <span className="text-gray-600">dry</span>
      ),
      r.target_id ? `${r.target_level}:${r.target_id}` : "—",
      <span key={r.id} className="max-w-[240px] truncate text-xs text-gray-500">
        {JSON.stringify(r.reason_json)}
      </span>,
    ]);

  return (
    <AdminShell>
      <AdminTitle
        title="Автопилот"
        subtitle="Direct K/B · Discovery D/ROMI · SEO S1 · один движок, без второго scheduler"
      />
      <AdsAdminNav pendingApprovals={pending} />
      <AdsErrorBanner error={error} />
      <DirectStatusCard />

      <p className="mb-4 text-xs text-gray-500">
        Журнал cron:{" "}
        <Link href="/admin/ads/health" className="text-aura-gold underline">
          /admin/ads/health
        </Link>
        {" · "}
        Апрувы:{" "}
        <Link href="/admin/ads/approvals" className="text-aura-gold underline">
          {pending} в очереди
        </Link>
        {" · "}
        SEO:{" "}
        <Link href="/admin/ads/seo" className="text-aura-gold underline">
          KEEP / ROLLBACK / NEXT
        </Link>
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Режим правил"
          value={rulesMode}
          accent={rulesMode === "apply" ? "text-aura-emerald" : "text-amber-400"}
        />
        <StatCard label="Daily cap" value={thresholds.discovery_daily_cap_rub ?? "—"} />
        <StatCard
          label="Overrides на сайте"
          value={organic?.overrides_applied ?? "—"}
        />
        <StatCard
          label="SEO experiments PENDING"
          value={organic?.experiments_pending ?? "—"}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-white">last_run (ads.job_run)</h2>
      <AdminTable
        headers={["Job", "Last run", "OK", "Error"]}
        rows={jobs.map((j) => [
          j.id,
          j.last_run ? new Date(j.last_run).toLocaleString("ru-RU") : "—",
          j.last_ok == null ? "—" : j.last_ok ? "yes" : "no",
          j.last_error || "—",
        ])}
      />

      <h2 className="mb-2 mt-8 text-sm font-semibold text-white">Охрана Direct (K / B)</h2>
      <AdminTable
        headers={["Время", "Правило", "Решение", "Applied", "Target", "Reason"]}
        rows={renderRows(guard)}
      />

      <h2 className="mb-2 mt-8 text-sm font-semibold text-white">Discovery (D / ROMI)</h2>
      <AdminTable
        headers={["Время", "Правило", "Решение", "Applied", "Target", "Reason"]}
        rows={renderRows(discovery)}
      />

      <h2 className="mb-2 mt-8 text-sm font-semibold text-white">SEO S1</h2>
      <p className="mb-2 text-xs text-gray-500">
        KEEP → статус запроса PROTECT. ROLLBACK снимает override с сайта. NEXT берёт следующий PUSH
        из реестра, без новой страницы.
      </p>
      <AdminTable
        headers={["Время", "Правило", "Решение", "Applied", "Target", "Reason"]}
        rows={renderRows(seo)}
      />
    </AdminShell>
  );
}
