import { NextResponse } from "next/server";
import { adsQuery } from "@/modules/ads/db";
import { isAdsAdminAuth, requireAdsAdmin } from "@/modules/ads/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdsAdmin();
  if (!isAdsAdminAuth(gate)) return gate;

  const { rows } = await adsQuery<{
    date: string;
    cohort_days: number;
    registrations: number;
    payers: number;
    revenue_rub: string;
    arpu_per_registration_rub: string | null;
    cr_reg_to_payer: string | null;
    avg_check_rub: string | null;
    max_allowed_cpa_reg_rub: string | null;
    sample_size: number;
    confidence: string;
  }>(
    `SELECT date::text, cohort_days, registrations, payers, revenue_rub::text,
            arpu_per_registration_rub::text, cr_reg_to_payer::text,
            avg_check_rub::text, max_allowed_cpa_reg_rub::text,
            sample_size, confidence
     FROM ads.economics_snapshot
     WHERE cohort_days = 30
     ORDER BY date DESC
     LIMIT 14`
  );

  const latest = rows[0] ?? null;
  const applyMaxAllowedCpa = latest != null && latest.sample_size >= 100;

  return NextResponse.json({
    latest: latest
      ? {
          date: latest.date,
          cohortDays: latest.cohort_days,
          registrations: latest.registrations,
          payers: latest.payers,
          revenueRub: Number(latest.revenue_rub),
          arpu30: latest.arpu_per_registration_rub != null
            ? Number(latest.arpu_per_registration_rub)
            : null,
          crRegToPayer: latest.cr_reg_to_payer != null
            ? Number(latest.cr_reg_to_payer)
            : null,
          avgCheckRub: latest.avg_check_rub != null
            ? Number(latest.avg_check_rub)
            : null,
          maxAllowedCpaRegRub:
            applyMaxAllowedCpa && latest.max_allowed_cpa_reg_rub != null
              ? Number(latest.max_allowed_cpa_reg_rub)
              : null,
          sampleSize: latest.sample_size,
          confidence: latest.confidence,
          applyMaxAllowedCpa,
          cpaNote: applyMaxAllowedCpa
            ? null
            : "не подтверждён данными",
        }
      : null,
    history: rows,
  });
}
