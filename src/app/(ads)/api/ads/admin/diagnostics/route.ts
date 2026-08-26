import { NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import {
  isAdsEnabled,
  isAdsObserve,
  isAdsRulesEnabled,
  isAdsAutopilotWrite,
  rulesMode,
  canAccessAdsAdmin,
} from "@/modules/ads/config";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { ADS_CRON_JOBS, loadAdsJobRuns } from "@/modules/ads/jobs";
import {
  envPresenceFlags,
  probeDirect,
  probeMetrika,
  probeWebmaster,
  probeWordstat,
  type ProviderProbe,
} from "@/modules/ads/sources/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SnapshotRow = {
  source: string;
  ok: boolean;
  fetched_at: Date | string | null;
  error: string | null;
};

function hoursSince(ts: Date | string | null): number | null {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3600000;
}

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  let snapshots: SnapshotRow[] = [];
  try {
    const r = await adsQuery<SnapshotRow>(
      `SELECT source, ok, fetched_at, error FROM ads.source_snapshot`
    );
    snapshots = r.rows;
  } catch {
    snapshots = [];
  }
  const snap = (name: string) => snapshots.find((s) => s.source === name);

  let schemaOk = true;
  let schemaError: string | null = null;
  let tables: string[] = [];
  try {
    const r = await adsQuery<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'ads' ORDER BY tablename`
    );
    tables = r.rows.map((x) => x.tablename);
    for (const need of ["source_snapshot", "webmaster_query_daily", "job_run"]) {
      if (!tables.includes(need)) {
        schemaOk = false;
        schemaError = `missing ads.${need}`;
      }
    }
  } catch (e) {
    schemaOk = false;
    schemaError = e instanceof Error ? e.message : String(e);
  }

  const counts: Record<string, number | null> = {
    webmaster_query_daily: null,
    wordstat_run: null,
    metrika_goal_stat: null,
    search_query_organic: null,
  };
  for (const table of Object.keys(counts)) {
    try {
      const r = await adsQuery<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ads.${table}`);
      counts[table] = Number(r.rows[0]?.n || 0);
    } catch {
      counts[table] = null;
    }
  }

  const [direct, metrika, webmaster, wordstat] = await Promise.all([
    probeDirect(),
    probeMetrika(),
    probeWebmaster(),
    probeWordstat(),
  ]);

  const attach = (
    provider: ProviderProbe["provider"],
    live: Pick<ProviderProbe, "configured" | "auth" | "api" | "error">,
    source: string,
    rows: number | null
  ): ProviderProbe => {
    const s = snap(source);
    return {
      provider,
      configured: live.configured,
      auth: live.auth,
      api: live.api,
      last_sync: s?.fetched_at ? new Date(s.fetched_at).toISOString() : null,
      rows,
      freshnessHours: hoursSince(s?.fetched_at ?? null),
      error: live.error || s?.error || null,
    };
  };

  const jobs = await loadAdsJobRuns();
  const jobMap = new Map(jobs.map((j) => [j.job, j]));

  return NextResponse.json({
    ok: true,
    fetchedAt: new Date().toISOString(),
    flags: {
      enabled: await isAdsEnabled(),
      observe: await isAdsObserve(),
      rulesEnabled: await isAdsRulesEnabled(),
      autopilotWrite: await isAdsAutopilotWrite(),
      rulesMode: rulesMode(),
      adminAccess: await canAccessAdsAdmin(),
    },
    env: envPresenceFlags(),
    db: { schemaOk, schemaError, tables, counts },
    providers: [
      attach("direct", direct, "direct", null),
      attach("metrika", metrika, "metrika", counts.metrika_goal_stat),
      attach("webmaster", webmaster, "webmaster", counts.webmaster_query_daily),
      attach("wordstat", wordstat, "wordstat", counts.wordstat_run),
    ],
    jobs: ADS_CRON_JOBS.map((spec) => {
      const row = jobMap.get(spec.id);
      return {
        id: spec.id,
        schedule: spec.schedule,
        access: spec.access,
        purpose: spec.purpose,
        last_run: row?.last_run_at ? new Date(row.last_run_at).toISOString() : null,
        last_success: row?.last_success_at ? new Date(row.last_success_at).toISOString() : null,
        last_error: row?.last_error ?? null,
        duration_ms: row?.last_duration_ms ?? null,
        last_ok: row?.last_ok ?? null,
      };
    }),
  });
}
