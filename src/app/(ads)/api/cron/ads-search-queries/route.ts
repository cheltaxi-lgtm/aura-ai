import { NextRequest } from "next/server";
import { runAdsCronJob } from "@/modules/ads/jobs";
import { fetchSearchQueryReport } from "@/modules/ads/direct/reports";
import { addNegativeKeywords } from "@/modules/ads/direct/keywords";
import { classifySearchQuery } from "@/modules/ads/rules/search-queries";
import { adsQuery } from "@/modules/ads/db";
import { canMutateDirect, rulesMode } from "@/modules/ads/config";
import { createApprovalRequest } from "@/modules/ads/approvals";
import { matchExistingLanding } from "@/modules/ads/organic/landings";
import { normalizeForMatch } from "@/modules/ads/validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type FunnelRow = {
  campaign_id: number;
  clicks: number;
  deck_views: number;
  spread_submits: number;
  registrations: number;
  first_payments: number;
};

export async function POST(request: NextRequest) {
  return runAdsCronJob(request, "ads-search-queries", async () => {
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const mode = rulesMode();
    const mutateDirect = await canMutateDirect();
    let processed = 0;
    let negativesPushed = 0;
    let negativesSkipped = 0;
    let negativeApiError: string | null = null;

    const funnelByCampaign = new Map<number, FunnelRow>();
    let funnelTotals: FunnelRow = {
      campaign_id: 0,
      clicks: 0,
      deck_views: 0,
      spread_submits: 0,
      registrations: 0,
      first_payments: 0,
    };
    try {
      const funnel = await adsQuery<FunnelRow>(
        `SELECT campaign_id,
                COALESCE(SUM(clicks),0)::int AS clicks,
                COALESCE(SUM(deck_views),0)::int AS deck_views,
                COALESCE(SUM(spread_submits),0)::int AS spread_submits,
                COALESCE(SUM(registrations),0)::int AS registrations,
                COALESCE(SUM(first_payments),0)::int AS first_payments
         FROM ads.funnel_daily
         WHERE date >= $1::date - 1
         GROUP BY campaign_id`,
        [day]
      );
      for (const row of funnel.rows) {
        funnelByCampaign.set(Number(row.campaign_id) || 0, row);
        funnelTotals = {
          campaign_id: 0,
          clicks: funnelTotals.clicks + row.clicks,
          deck_views: funnelTotals.deck_views + row.deck_views,
          spread_submits: funnelTotals.spread_submits + row.spread_submits,
          registrations: funnelTotals.registrations + row.registrations,
          first_payments: funnelTotals.first_payments + row.first_payments,
        };
      }
    } catch {
      /* funnel table may be empty */
    }

    const coreSet = new Set<string>();
    try {
      const core = await adsQuery<{ normalized: string }>(
        `SELECT normalized FROM ads.keyword_candidate
         WHERE status IN ('approved','pushed')`
      );
      for (const row of core.rows) coreSet.add(row.normalized);
    } catch {
      /* optional */
    }

    const { csv } = await fetchSearchQueryReport(day, day);
    for (const line of csv.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("Date")) continue;
      const p = line.split("\t");
      const query = p[4] || p[3] || "";
      if (!query) continue;
      const campaignId = Number(p[1]) || 0;
      const clicks = Number(p[6] || p[5] || 0);
      const cost = Number(String(p[7] || p[6] || "0").replace(",", ".")) || 0;
      const funnel = funnelByCampaign.get(campaignId) || funnelTotals;
      const landing = matchExistingLanding(query);
      const denom = funnel.clicks > 0 ? funnel.clicks : 0;
      const share = (part: number) =>
        denom > 0 && clicks > 0 ? Math.round((clicks / denom) * part) : 0;
      const regsShare = share(funnel.registrations);
      const decision = classifySearchQuery({
        query,
        clicks,
        deckViews: funnel.deck_views,
        spreadSubmits: funnel.spread_submits,
        registrations: regsShare,
        firstPayments: share(funnel.first_payments),
        landingExists: landing.landingMatch,
        inCore: coreSet.has(normalizeForMatch(query)),
      });
      await adsQuery(
        `INSERT INTO ads.search_query
          (date, campaign_id, adgroup_id, query, matched_keyword, clicks, cost_rub,
           deck_views, spread_submits, registrations, decision, decided_at)
         VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (date, campaign_id, adgroup_id, query) DO UPDATE SET
           clicks = EXCLUDED.clicks,
           cost_rub = EXCLUDED.cost_rub,
           deck_views = EXCLUDED.deck_views,
           spread_submits = EXCLUDED.spread_submits,
           registrations = EXCLUDED.registrations,
           decision = EXCLUDED.decision,
           decided_at = NOW()`,
        [
          day,
          campaignId,
          Number(p[2]) || 0,
          query.slice(0, 500),
          p[3] || null,
          clicks,
          cost,
          funnel.deck_views,
          funnel.spread_submits,
          regsShare,
          decision.decision,
        ]
      );
      if (decision.decision === "negative") {
        await adsQuery(
          `INSERT INTO ads.negative_keyword (phrase, scope, reason, auto)
           VALUES ($1, 'account', $2, TRUE)`,
          [query.slice(0, 255), decision.reason]
        );
        if (mutateDirect && campaignId > 0) {
          try {
            await addNegativeKeywords(campaignId, [query.slice(0, 255)]);
            negativesPushed++;
          } catch (e) {
            negativeApiError = e instanceof Error ? e.message : String(e);
          }
        } else {
          negativesSkipped++;
        }
      }
      if (decision.decision === "new_landing_approval") {
        await createApprovalRequest({
          kind: "new_landing",
          proposedValue: { query },
          rationale: decision,
        });
      }
      processed++;
    }
    return {
      processed,
      mode,
      mutateDirect,
      negativesPushed,
      negativesSkipped,
      negativeApiError,
    };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
