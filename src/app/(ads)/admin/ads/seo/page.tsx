"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, AdminBtn, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsErrorBanner from "@/modules/ads/admin/AdsErrorBanner";

type Landing = {
  path: string;
  ok: boolean;
  status: number | null;
  title: string | null;
  description: string | null;
  h1: string | null;
  canonical: string | null;
  noindex: boolean;
  schemaTypes: string[];
  inSitemap: boolean;
  issues: string[];
};

type Experiment = {
  id: string;
  query: string | null;
  url: string;
  action: string;
  reason: string | null;
  score: number | null;
  position_before: number | null;
  position_3d: number | null;
  position_7d: number | null;
  position_14d: number | null;
  position_30d: number | null;
  result: string | null;
  auto_safe: boolean;
  applied_at: string | null;
  created_at: string;
  on_site?: boolean;
};

export default function AdsSeoPage() {
  const [error, setError] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [landings, setLandings] = useState<Landing[]>([]);
  const [broken, setBroken] = useState<string[]>([]);
  const [orphan, setOrphan] = useState<string[]>([]);
  const [sitemapCount, setSitemapCount] = useState<number | null>(null);
  const [busyAudit, setBusyAudit] = useState(false);
  const [busyS1, setBusyS1] = useState(false);
  const [busyDecide, setBusyDecide] = useState<string | null>(null);

  const load = useCallback(async (audit: boolean) => {
    if (audit) setBusyAudit(true);
    try {
      const r = await fetch(`/api/ads/admin/seo${audit ? "?audit=1" : ""}`);
      const d = (await r.json()) as {
        ok?: boolean;
        error?: string;
        experiments?: Experiment[];
        audit?: {
          landings?: Landing[];
          broken?: string[];
          orphan?: string[];
          sitemapCount?: number;
          error?: string | null;
        } | null;
      };
      if (!r.ok || d.ok === false) {
        setError(d.error || `HTTP ${r.status}`);
        return;
      }
      setExperiments(d.experiments ?? []);
      if (d.audit) {
        setLandings(d.audit.landings ?? []);
        setBroken(d.audit.broken ?? []);
        setOrphan(d.audit.orphan ?? []);
        setSitemapCount(d.audit.sitemapCount ?? null);
        if (d.audit.error) setError(d.audit.error);
        else setError(null);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      if (audit) setBusyAudit(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const decide = async (id: string, result: "KEEP" | "ROLLBACK" | "NEXT") => {
    setBusyDecide(`${id}:${result}`);
    try {
      const r = await fetch("/api/ads/admin/seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId: id, result }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) setError(d.error || `HTTP ${r.status}`);
      else await load(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network");
    } finally {
      setBusyDecide(null);
    }
  };

  return (
    <AdminShell>
      <AdminTitle
        title="SEO"
        subtitle="аудит существующих landing · эксперименты 3/7/14/30д · без thin pages и накрутки ПФ"
      />
      <AdsAdminNav />
      <AdsErrorBanner error={error} />

      <div className="mb-4 flex flex-wrap gap-2">
        <AdminBtn disabled={busyAudit || busyS1} onClick={() => void load(true)}>
          {busyAudit ? "Аудит…" : "Прогнать аудит landing"}
        </AdminBtn>
        <AdminBtn
          disabled={busyAudit || busyS1}
          onClick={async () => {
            setBusyS1(true);
            try {
              const r = await fetch("/api/ads/admin/seo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "evaluate" }),
              });
              const d = (await r.json()) as { error?: string };
              if (!r.ok) setError(d.error || `HTTP ${r.status}`);
              else await load(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "network");
            } finally {
              setBusyS1(false);
            }
          }}
        >
          {busyS1 ? "S1…" : "Предложить auto-safe (S1)"}
        </AdminBtn>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Эксперименты" value={experiments.length} />
        <StatCard label="Sitemap URLs" value={sitemapCount ?? "—"} />
        <StatCard label="Broken" value={broken.length} accent={broken.length ? "text-red-400" : undefined} />
      </div>

      {landings.length ? (
        <>
          <h2 className="mb-3 text-sm font-semibold text-white">Landing audit</h2>
          <AdminTable
            headers={["Path", "HTTP", "Title", "H1", "Canonical", "noindex", "Schema", "Issues"]}
            rows={landings.map((l) => [
              l.path,
              l.status != null ? String(l.status) : "—",
              l.title || "—",
              l.h1 || "—",
              l.canonical || "—",
              l.noindex ? "yes" : "—",
              l.schemaTypes.slice(0, 3).join(", ") || "—",
              l.issues.join(", ") || "—",
            ])}
          />
          {orphan.length ? (
            <p className="mt-2 text-xs text-amber-400">Orphan (в sitemap, не в whitelist): {orphan.slice(0, 12).join(", ")}</p>
          ) : null}
        </>
      ) : null}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Эксперименты</h2>
      <AdminTable
        headers={["", "Query", "URL", "Action", "На сайте", "Result", "Pos 3/7/14/30"]}
        rows={experiments.map((e) => [
          <span key="act" className="flex flex-wrap gap-1">
            <AdminBtn disabled={!!busyDecide} onClick={() => void decide(e.id, "KEEP")}>
              KEEP
            </AdminBtn>
            <AdminBtn disabled={!!busyDecide} onClick={() => void decide(e.id, "ROLLBACK")}>
              ROLLBACK
            </AdminBtn>
            <AdminBtn disabled={!!busyDecide} onClick={() => void decide(e.id, "NEXT")}>
              NEXT
            </AdminBtn>
          </span>,
          e.query || "—",
          e.url,
          `${e.action}${e.auto_safe ? " · auto-safe" : ""}`,
          e.on_site ? "да" : "—",
          e.result || "PENDING",
          [
            e.position_before,
            e.position_3d,
            e.position_7d,
            e.position_14d,
            e.position_30d,
          ]
            .map((n) => (n != null ? String(n) : "—"))
            .join(" / "),
        ])}
      />
    </AdminShell>
  );
}
