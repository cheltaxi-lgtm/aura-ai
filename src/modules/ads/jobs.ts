/**
 * Ads cron catalog + last_run tracking.
 * Frequencies come from existing job comments/purpose — not a second scheduler.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireCronOrAdmin } from "./cron-auth";
import { canAccessAdsAdmin, isAdsAutopilotWrite, isAdsEnabled } from "./config";
import { adsQuery } from "./db";

export type AdsCronAccess = "observe" | "write";

export type AdsCronJobSpec = {
  id: string;
  /** crontab 5-field expression, UTC */
  schedule: string;
  timeoutSec: number;
  access: AdsCronAccess;
  purpose: string;
};

export const ADS_CRON_JOBS: AdsCronJobSpec[] = [
  {
    id: "ads-budget-guard",
    schedule: "*/15 * * * *",
    timeoutSec: 60,
    access: "observe",
    purpose: "B1 hard budget every 15 min",
  },
  {
    id: "ads-landing-check",
    schedule: "5 * * * *",
    timeoutSec: 90,
    access: "observe",
    purpose: "B3 landing health hourly",
  },
  {
    id: "ads-freshness-guard",
    schedule: "10 * * * *",
    timeoutSec: 60,
    access: "observe",
    purpose: "B2 stats freshness hourly",
  },
  {
    id: "ads-collect-conversions",
    schedule: "20 * * * *",
    timeoutSec: 90,
    access: "observe",
    purpose: "Internal conversion collect hourly",
  },
  {
    id: "ads-offline-conversions",
    schedule: "30 * * * *",
    timeoutSec: 90,
    access: "write",
    purpose: "Metrika offline conversion upload (write)",
  },
  {
    id: "ads-rules",
    schedule: "40 * * * *",
    timeoutSec: 90,
    access: "observe",
    purpose: "Rules + SEO proposals hourly; Direct pause gated",
  },
  {
    id: "ads-sync-sources",
    schedule: "0 */6 * * *",
    timeoutSec: 180,
    access: "observe",
    purpose: "Metrika/Webmaster/Direct/Wordstat snapshots every 6h",
  },
  {
    id: "ads-sync-stats",
    schedule: "5 */6 * * *",
    timeoutSec: 180,
    access: "observe",
    purpose: "Direct stats READ every 6h",
  },
  {
    id: "ads-sync-entities",
    schedule: "15 */6 * * *",
    timeoutSec: 120,
    access: "observe",
    purpose: "Direct entity snapshot READ every 6h",
  },
  {
    id: "ads-semantics",
    schedule: "0 4 * * *",
    timeoutSec: 180,
    access: "observe",
    purpose: "Semantics daily",
  },
  {
    id: "ads-economics",
    schedule: "15 4 * * *",
    timeoutSec: 90,
    access: "observe",
    purpose: "Economics rollup daily",
  },
  {
    id: "ads-funnel-rollup",
    schedule: "30 4 * * *",
    timeoutSec: 90,
    access: "observe",
    purpose: "Funnel daily rollup",
  },
  {
    id: "ads-search-queries",
    schedule: "45 5 * * *",
    timeoutSec: 180,
    access: "observe",
    purpose: "Direct search-query report; negatives only if write",
  },
  {
    id: "ads-max-days-guard",
    schedule: "0 7 * * *",
    timeoutSec: 60,
    access: "observe",
    purpose: "B6 forgotten test daily",
  },
  {
    id: "ads-weekly-digest",
    schedule: "0 8 * * 0",
    timeoutSec: 120,
    access: "observe",
    purpose: "B6 weekly digest Sunday 08:00 UTC",
  },
];

export type AdsJobRunRow = {
  job: string;
  last_run_at: Date | string | null;
  last_success_at: Date | string | null;
  last_error: string | null;
  last_duration_ms: number | null;
  last_ok: boolean | null;
};

export async function recordAdsJobStart(job: string): Promise<void> {
  try {
    await adsQuery(
      `INSERT INTO ads.job_run (job, last_run_at)
       VALUES ($1, NOW())
       ON CONFLICT (job) DO UPDATE SET last_run_at = NOW()`,
      [job]
    );
  } catch {
    /* table may not exist yet */
  }
}

export async function recordAdsJobFinish(
  job: string,
  ok: boolean,
  error: string | null,
  durationMs: number
): Promise<void> {
  try {
    await adsQuery(
      `INSERT INTO ads.job_run (job, last_run_at, last_success_at, last_error, last_duration_ms, last_ok)
       VALUES ($1, NOW(), CASE WHEN $2 THEN NOW() ELSE NULL END, $3, $4, $2)
       ON CONFLICT (job) DO UPDATE SET
         last_success_at = CASE WHEN EXCLUDED.last_ok THEN NOW() ELSE ads.job_run.last_success_at END,
         last_error = EXCLUDED.last_error,
         last_duration_ms = EXCLUDED.last_duration_ms,
         last_ok = EXCLUDED.last_ok`,
      [job, ok, ok ? null : (error || "error").slice(0, 2000), durationMs]
    );
  } catch {
    /* table may not exist yet */
  }
}

export async function loadAdsJobRuns(): Promise<AdsJobRunRow[]> {
  try {
    const { rows } = await adsQuery<AdsJobRunRow>(
      `SELECT job, last_run_at, last_success_at, last_error, last_duration_ms, last_ok
       FROM ads.job_run`
    );
    return rows;
  } catch {
    return [];
  }
}

export async function runAdsCronJob(
  request: NextRequest,
  jobId: string,
  handler: () => Promise<Record<string, unknown>>
): Promise<NextResponse> {
  const spec = ADS_CRON_JOBS.find((j) => j.id === jobId);
  if (!spec) {
    return NextResponse.json({ error: "unknown_job" }, { status: 404 });
  }
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;
  if (!(await canAccessAdsAdmin())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const started = Date.now();
  await recordAdsJobStart(jobId);

  if (spec.access === "write") {
    const enabled = await isAdsEnabled();
    const write = await isAdsAutopilotWrite();
    if (!enabled || !write) {
      const durationMs = Date.now() - started;
      await recordAdsJobFinish(jobId, true, null, durationMs);
      return NextResponse.json({
        ok: true,
        skipped: "write_disabled",
        enabled,
        write,
      });
    }
  }

  try {
    const result = await handler();
    await recordAdsJobFinish(jobId, true, null, Date.now() - started);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordAdsJobFinish(jobId, false, error, Date.now() - started);
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}
