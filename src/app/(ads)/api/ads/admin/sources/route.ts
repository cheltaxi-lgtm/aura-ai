import { NextRequest, NextResponse } from "next/server";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";
import { loadSourceSnapshots, syncAllSources } from "@/modules/ads/sources/sync";
import { adsQuery } from "@/modules/ads/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  let snapshots: Awaited<ReturnType<typeof loadSourceSnapshots>> = {};
  try {
    snapshots = await loadSourceSnapshots();
  } catch (e) {
    return NextResponse.json({
      needsMigration: true,
      error: e instanceof Error ? e.message : "source_snapshot missing — run migrate 085",
      snapshots: {},
      recentWebmaster: [],
      recentGoals: [],
    });
  }

  let recentWebmaster: { query: string; clicks: number; shows: number; position: number | null }[] =
    [];
  let recentGoals: { date: string; goal_id: number; goal_name: string | null; reaches: number }[] =
    [];
  try {
    const w = await adsQuery<{
      query: string;
      clicks: number;
      shows: number;
      position: string | null;
    }>(
      `SELECT query, clicks, shows, position::text
       FROM ads.webmaster_query_daily
       WHERE date = (SELECT MAX(date) FROM ads.webmaster_query_daily)
       ORDER BY clicks DESC NULLS LAST
       LIMIT 30`
    );
    recentWebmaster = w.rows.map((r) => ({
      query: r.query,
      clicks: r.clicks,
      shows: r.shows,
      position: r.position != null ? Number(r.position) : null,
    }));
    const g = await adsQuery<{
      date: Date;
      goal_id: string;
      goal_name: string | null;
      reaches: number;
    }>(
      `SELECT date, goal_id::text, goal_name, reaches
       FROM ads.metrika_goal_stat
       WHERE date >= CURRENT_DATE - 7
       ORDER BY date DESC, reaches DESC
       LIMIT 40`
    );
    recentGoals = g.rows.map((r) => ({
      date: new Date(r.date).toISOString().slice(0, 10),
      goal_id: Number(r.goal_id),
      goal_name: r.goal_name,
      reaches: r.reaches,
    }));
  } catch {
    /* detail tables optional until 085 */
  }

  return NextResponse.json({
    needsMigration: false,
    snapshots,
    recentWebmaster,
    recentGoals,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;
  const body = (await req.json().catch(() => ({}))) as { refresh?: boolean };
  if (body.refresh === false) {
    return NextResponse.json({ ok: true });
  }
  const result = await syncAllSources();
  await writeAdsAdminAction({
    adminId: auth.sub,
    action: "sources_refresh",
    payload: result,
    entityType: "ads_sources",
  });
  const snapshots = await loadSourceSnapshots();
  return NextResponse.json({ ok: true, result, snapshots });
}
