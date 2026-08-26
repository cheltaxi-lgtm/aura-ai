import { NextRequest, NextResponse } from "next/server";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { listOrganicQueries, listPositionHistory } from "@/modules/ads/organic/registry";
import type { OrganicStatus } from "@/modules/ads/organic/score";
import { ORGANIC_STATUSES } from "@/modules/ads/organic/score";
import { adsQuery } from "@/modules/ads/db";
import { writeAdsAdminAction } from "@/modules/ads/admin/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const statusRaw = request.nextUrl.searchParams.get("status");
  const query = request.nextUrl.searchParams.get("query");
  const status =
    statusRaw && (ORGANIC_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as OrganicStatus)
      : undefined;
  try {
    if (query) {
      const history = await listPositionHistory(query);
      const { rows } = await adsQuery(
        `SELECT * FROM ads.search_query_organic WHERE query = $1 LIMIT 1`,
        [query]
      );
      return NextResponse.json({ ok: true, item: rows[0] ?? null, history });
    }
    const items = await listOrganicQueries({ status, limit: 300 });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e), items: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;
  const { auth } = gate;
  const body = (await req.json().catch(() => ({}))) as {
    query?: string;
    status?: OrganicStatus;
  };
  if (!body.query || !body.status || !(ORGANIC_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "query_and_status_required" }, { status: 400 });
  }
  try {
    await adsQuery(
      `UPDATE ads.search_query_organic SET status = $2, updated_at = NOW() WHERE query = $1`,
      [body.query, body.status]
    );
    await writeAdsAdminAction({
      adminId: auth.sub,
      action: "organic_status",
      payload: { query: body.query, status: body.status },
      entityType: "ads_search_query_organic",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
