import { NextRequest, NextResponse } from "next/server";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { adsQuery } from "@/modules/ads/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily ads dynamics for overview charts.
 * GET /api/ads/admin/dynamics?days=7..90
 * spend:  ads.daily_stats aggregated by date (impressions/clicks/cost)
 * funnel: ads.funnel_daily aggregated by date (steps + revenue)
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const raw = Number(request.nextUrl.searchParams.get("days"));
  const days = [7, 14, 30, 90].includes(raw) ? raw : 30;

  try {
    const [spend, funnel] = await Promise.all([
      adsQuery<{
        date: string;
        impressions: string;
        clicks: string;
        cost_rub: string;
      }>(
        `SELECT date::text,
                SUM(impressions)::text AS impressions,
                SUM(clicks)::text AS clicks,
                SUM(cost_rub)::text AS cost_rub
         FROM ads.daily_stats
         WHERE date >= CURRENT_DATE - $1::int
         GROUP BY date ORDER BY date ASC`,
        [days]
      ),
      adsQuery<{
        date: string;
        clicks: string;
        deck_views: string;
        spread_submits: string;
        teaser_views: string;
        registrations: string;
        claims: string;
        first_payments: string;
        revenue_rub: string;
      }>(
        `SELECT date::text,
                SUM(clicks)::text AS clicks,
                SUM(deck_views)::text AS deck_views,
                SUM(spread_submits)::text AS spread_submits,
                SUM(teaser_views)::text AS teaser_views,
                SUM(registrations)::text AS registrations,
                SUM(claims)::text AS claims,
                SUM(first_payments)::text AS first_payments,
                SUM(revenue_rub)::text AS revenue_rub
         FROM ads.funnel_daily
         WHERE date >= CURRENT_DATE - $1::int
         GROUP BY date ORDER BY date ASC`,
        [days]
      ),
    ]);

    const revenueByDate = new Map(funnel.rows.map((r) => [r.date, Number(r.revenue_rub) || 0]));

    return NextResponse.json({
      ok: true,
      days,
      spend: spend.rows.map((r) => ({
        date: r.date,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.clicks) || 0,
        costRub: Number(r.cost_rub) || 0,
        revenueRub: revenueByDate.get(r.date) ?? 0,
      })),
      funnel: funnel.rows.map((r) => ({
        date: r.date,
        clicks: Number(r.clicks) || 0,
        deckViews: Number(r.deck_views) || 0,
        spreadSubmits: Number(r.spread_submits) || 0,
        teaserViews: Number(r.teaser_views) || 0,
        registrations: Number(r.registrations) || 0,
        claims: Number(r.claims) || 0,
        firstPayments: Number(r.first_payments) || 0,
        revenueRub: Number(r.revenue_rub) || 0,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
