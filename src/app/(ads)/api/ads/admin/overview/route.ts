import { NextResponse } from "next/server";
import { getBudget, isAdsEnabled, isAdsObserve, rulesMode } from "@/modules/ads/config";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";
import { loadSourceSnapshots } from "@/modules/ads/sources/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FunnelStep = { key: string; label: string; value: number };

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const budget = await getBudget();
  const [spend, visits, regs, funnelAgg] = await Promise.all([
    adsQuery<{ s: string }>(
      `SELECT COALESCE(SUM(cost_rub),0)::text AS s FROM ads.daily_stats`
    ),
    adsQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ads.click`
    ),
    adsQuery<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ads.conversion WHERE type='registration'`
    ),
    adsQuery<{
      clicks: string;
      deck_views: string;
      spread_submits: string;
      teaser_views: string;
      registrations: string;
      claims: string;
      first_payments: string;
    }>(
      `SELECT
         COALESCE(SUM(clicks),0)::text AS clicks,
         COALESCE(SUM(deck_views),0)::text AS deck_views,
         COALESCE(SUM(spread_submits),0)::text AS spread_submits,
         COALESCE(SUM(teaser_views),0)::text AS teaser_views,
         COALESCE(SUM(registrations),0)::text AS registrations,
         COALESCE(SUM(claims),0)::text AS claims,
         COALESCE(SUM(first_payments),0)::text AS first_payments
       FROM ads.funnel_daily`
    ),
  ]);

  const spent = Number(spend.rows[0]?.s || 0);
  const visitsN = Number(visits.rows[0]?.n || 0);
  const regsN = Number(regs.rows[0]?.n || 0);
  const target = budget.discovery_target_registrations || 100;
  const progressPct = Math.min(100, Math.round((regsN / target) * 1000) / 10);

  const f = funnelAgg.rows[0];
  const steps: FunnelStep[] = [
    { key: "clicks", label: "Клики", value: Number(f?.clicks || 0) },
    { key: "deck_view", label: "deck_view", value: Number(f?.deck_views || 0) },
    { key: "spread_submit", label: "spread_submit", value: Number(f?.spread_submits || 0) },
    { key: "teaser_view", label: "teaser_view", value: Number(f?.teaser_views || 0) },
    { key: "registration", label: "registration", value: Number(f?.registrations || 0) },
    { key: "claim", label: "claim", value: Number(f?.claims || 0) },
    { key: "first_payment", label: "первая покупка", value: Number(f?.first_payments || 0) },
  ];

  const funnel = steps.map((step, i) => {
    const prev = i === 0 ? null : steps[i - 1].value;
    const cr = prev && prev > 0 ? step.value / prev : null;
    return {
      ...step,
      cr,
      sampleSmall: step.value < 30,
    };
  });

  let worstIdx = -1;
  let worstCr = Infinity;
  for (let i = 1; i < funnel.length; i++) {
    const cr = funnel[i].cr;
    if (cr != null && cr < worstCr) {
      worstCr = cr;
      worstIdx = i;
    }
  }

  const insights = funnel
    .filter((s) => s.key !== "clicks")
    .map((s) => ({
      step: s.label,
      value: s.value,
      cr: s.cr,
      note: s.sampleSmall ? "выборка мала" : null,
    }));

  let health: {
    balanceRub: number | null;
    metrikaVisits7d: number | null;
    moneyBlocker: string | null;
    sourcesSyncedAt: string | null;
    directOk: boolean | null;
    metrikaOk: boolean | null;
    webmasterOk: boolean | null;
  } = {
    balanceRub: null,
    metrikaVisits7d: null,
    moneyBlocker: null,
    sourcesSyncedAt: null,
    directOk: null,
    metrikaOk: null,
    webmasterOk: null,
  };
  try {
    const snaps = await loadSourceSnapshots();
    const d = snaps.direct?.payload as { balanceRub?: number | null } | undefined;
    const m = snaps.metrika?.payload as {
      traffic7d?: { visits?: number } | null;
    } | undefined;
    const h = snaps.health?.payload as { moneyBlocker?: string | null } | undefined;
    health = {
      balanceRub: d?.balanceRub ?? null,
      metrikaVisits7d: m?.traffic7d?.visits ?? null,
      moneyBlocker: h?.moneyBlocker ?? null,
      sourcesSyncedAt: snaps.health?.fetchedAt || snaps.direct?.fetchedAt || null,
      directOk: snaps.direct?.ok ?? null,
      metrikaOk: snaps.metrika?.ok ?? null,
      webmasterOk: snaps.webmaster?.ok ?? null,
    };
  } catch {
    /* 085 not applied yet */
  }

  return NextResponse.json({
    mode: budget.mode,
    flags: {
      enabled: await isAdsEnabled(),
      observe: await isAdsObserve(),
      rulesMode: rulesMode(),
    },
    spent,
    visits: visitsN,
    registrations: regsN,
    targetRegistrations: target,
    progressPct,
    funnel,
    worstStep: worstIdx >= 0 ? funnel[worstIdx].key : null,
    insights,
    health,
    // discovery: no ROMI / ДРР
  });
}
