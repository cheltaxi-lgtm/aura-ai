import { NextRequest, NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const [candidates, negatives, queries] = await Promise.all([
    adsQuery(
      `SELECT id, phrase, normalized, source, cluster_key, landing_path,
              freq_exact, freq_phrase, forecast_cpc_rub, status, created_at
       FROM ads.keyword_candidate
       ORDER BY created_at DESC
       LIMIT 200`
    ),
    adsQuery(
      `SELECT id, phrase, scope, scope_id, reason, auto, created_at
       FROM ads.negative_keyword
       ORDER BY created_at DESC
       LIMIT 200`
    ),
    adsQuery(
      `SELECT date, campaign_id, adgroup_id, query, matched_keyword,
              clicks, cost_rub, deck_views, spread_submits, registrations,
              decision, decided_at
       FROM ads.search_query
       WHERE date >= CURRENT_DATE - 1
       ORDER BY clicks DESC, cost_rub DESC
       LIMIT 200`
    ),
  ]);

  return NextResponse.json({
    candidates: candidates.rows,
    negatives: negatives.rows,
    searchQueries: queries.rows,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    ids?: string[];
    date?: string;
    campaignId?: number;
    adgroupId?: number;
    query?: string;
  };

  if (body.action === "approve_candidates" || body.action === "reject_candidates") {
    const ids = body.ids || [];
    if (!ids.length) {
      return NextResponse.json({ error: "ids_required" }, { status: 400 });
    }
    const status = body.action === "approve_candidates" ? "approved" : "rejected";
    await adsQuery(
      `UPDATE ads.keyword_candidate SET status = $1
       WHERE id = ANY($2::uuid[]) AND status = 'pending'`,
      [status, ids]
    );
    await writeAdsAdminAction({
      adminId: auth.sub,
      action: body.action,
      payload: { ids, status },
      entityType: "ads_keyword_candidate",
    });
    return NextResponse.json({ ok: true, status, count: ids.length });
  }

  if (body.action === "undo_query") {
    if (!body.query || !body.date) {
      return NextResponse.json({ error: "query_date_required" }, { status: 400 });
    }
    await adsQuery(
      `UPDATE ads.search_query
       SET decision = NULL, decided_at = NULL
       WHERE date = $1::date AND campaign_id = $2 AND adgroup_id = $3 AND query = $4`,
      [body.date, body.campaignId ?? 0, body.adgroupId ?? 0, body.query]
    );
    await writeAdsAdminAction({
      adminId: auth.sub,
      action: "undo_search_query",
      payload: body,
      entityType: "ads_search_query",
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
