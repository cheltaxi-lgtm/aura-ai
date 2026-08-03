import { NextRequest, NextResponse } from "next/server";
import { requireAdsEnabled } from "@/modules/ads/gate";
import { requireCronOrAdmin } from "@/modules/ads/cron-auth";
import { fetchSearchQueryReport } from "@/modules/ads/direct/reports";
import { classifySearchQuery } from "@/modules/ads/rules/search-queries";
import { adsQuery } from "@/modules/ads/db";
import { rulesMode } from "@/modules/ads/config";
import { createApprovalRequest } from "@/modules/ads/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gated = await requireAdsEnabled();
  if (gated) return gated;
  const auth = await requireCronOrAdmin(request);
  if (auth) return auth;

  const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const mode = rulesMode();
  let processed = 0;
  try {
    const { csv } = await fetchSearchQueryReport(day, day);
    for (const line of csv.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("Date")) continue;
      const p = line.split("\t");
      const query = p[4] || p[3] || "";
      if (!query) continue;
      const clicks = Number(p[6] || p[5] || 0);
      const cost = Number(String(p[7] || p[6] || "0").replace(",", ".")) || 0;
      const decision = classifySearchQuery({
        query,
        clicks,
        deckViews: 0,
        spreadSubmits: 0,
        registrations: 0,
        firstPayments: 0,
        landingExists: true,
        inCore: false,
      });
      await adsQuery(
        `INSERT INTO ads.search_query
          (date, campaign_id, adgroup_id, query, matched_keyword, clicks, cost_rub,
           decision, decided_at)
         VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,NOW())
         ON CONFLICT (date, campaign_id, adgroup_id, query) DO UPDATE SET
           clicks = EXCLUDED.clicks,
           cost_rub = EXCLUDED.cost_rub,
           decision = EXCLUDED.decision,
           decided_at = NOW()`,
        [
          day,
          Number(p[1]) || 0,
          Number(p[2]) || 0,
          query.slice(0, 500),
          p[3] || null,
          clicks,
          cost,
          decision.decision,
        ]
      );
      if (decision.decision === "negative" && mode === "apply") {
        await adsQuery(
          `INSERT INTO ads.negative_keyword (phrase, scope, reason, auto)
           VALUES ($1, 'account', $2, TRUE)`,
          [query.slice(0, 255), decision.reason]
        );
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
    return NextResponse.json({ ok: true, processed, mode });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error", processed },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
