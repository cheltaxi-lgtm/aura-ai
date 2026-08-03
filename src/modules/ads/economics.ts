/**
 * Cohort economics → ads.economics_snapshot.
 * sample_size < 100 → confidence low; max_allowed_cpa not applied.
 */
import { adsQuery } from "./db";
import { getBudget } from "./config";

export type EconomicsSnapshot = {
  date: string;
  cohortDays: number;
  registrations: number;
  payers: number;
  revenueRub: number;
  arpuPerRegistrationRub: number | null;
  crRegToPayer: number | null;
  avgCheckRub: number | null;
  maxAllowedCpaRegRub: number | null;
  sampleSize: number;
  confidence: "low" | "medium" | "high";
  /** When false, admin UI must show "не подтверждён данными" and not apply CPA cap */
  applyMaxAllowedCpa: boolean;
};

/** Pure cohort math — used by cron and unit tests (V19/V25). */
export function computeEconomicsFromCohort(input: {
  registrations: number;
  payers: number;
  revenueRub: number;
  targetRomi: number;
  cohortDays?: number;
  date?: string;
}): EconomicsSnapshot {
  const registrations = input.registrations;
  const payers = input.payers;
  const revenueRub = input.revenueRub;
  const arpuPerRegistrationRub =
    registrations > 0 ? revenueRub / registrations : null;
  const crRegToPayer = registrations > 0 ? payers / registrations : null;
  const avgCheckRub = payers > 0 ? revenueRub / payers : null;
  const sampleSize = registrations;
  let confidence: "low" | "medium" | "high" = "low";
  if (sampleSize >= 300) confidence = "high";
  else if (sampleSize >= 100) confidence = "medium";
  const applyMaxAllowedCpa = sampleSize >= 100;
  const maxAllowedCpaRegRub =
    applyMaxAllowedCpa && arpuPerRegistrationRub != null
      ? arpuPerRegistrationRub / Math.max(0.01, input.targetRomi)
      : null;
  return {
    date: input.date || new Date().toISOString().slice(0, 10),
    cohortDays: input.cohortDays ?? 30,
    registrations,
    payers,
    revenueRub,
    arpuPerRegistrationRub,
    crRegToPayer,
    avgCheckRub,
    maxAllowedCpaRegRub,
    sampleSize,
    confidence,
    applyMaxAllowedCpa,
  };
}

export async function computeEconomics(opts?: {
  cohortDays?: number;
  asOf?: Date;
}): Promise<EconomicsSnapshot> {
  const budget = await getBudget();
  const cohortDays = opts?.cohortDays ?? 30;
  const asOf = opts?.asOf ?? new Date();
  const asOfDate = asOf.toISOString().slice(0, 10);

  const { rows: regRows } = await adsQuery<{ n: string }>(
    `SELECT COUNT(DISTINCT user_id)::text AS n
     FROM ads.conversion
     WHERE type = 'registration'
       AND user_id IS NOT NULL
       AND occurred_at >= $1::date - ($2::text || ' days')::interval
       AND occurred_at < $1::date + interval '1 day'`,
    [asOfDate, String(cohortDays)]
  );
  const registrations = Number(regRows[0]?.n || 0);

  const { rows: payRows } = await adsQuery<{
    payers: string;
    revenue: string;
  }>(
    `SELECT COUNT(DISTINCT user_id)::text AS payers,
            COALESCE(SUM(amount_rub), 0)::text AS revenue
     FROM ads.conversion
     WHERE type IN ('first_payment', 'repeat_payment')
       AND user_id IS NOT NULL
       AND occurred_at >= $1::date - ($2::text || ' days')::interval
       AND occurred_at < $1::date + interval '1 day'
       AND user_id IN (
         SELECT user_id FROM ads.conversion
         WHERE type = 'registration'
           AND user_id IS NOT NULL
           AND occurred_at >= $1::date - ($2::text || ' days')::interval
           AND occurred_at < $1::date + interval '1 day'
       )`,
    [asOfDate, String(cohortDays)]
  );

  const payers = Number(payRows[0]?.payers || 0);
  const revenueRub = Number(payRows[0]?.revenue || 0);
  const snap = computeEconomicsFromCohort({
    registrations,
    payers,
    revenueRub,
    targetRomi: budget.target_romi,
    cohortDays,
    date: asOfDate,
  });
  const {
    arpuPerRegistrationRub,
    crRegToPayer,
    avgCheckRub,
    maxAllowedCpaRegRub,
    sampleSize,
    confidence,
  } = snap;

  await adsQuery(
    `INSERT INTO ads.economics_snapshot (
       date, cohort_days, registrations, payers, revenue_rub,
       arpu_per_registration_rub, cr_reg_to_payer, avg_check_rub,
       max_allowed_cpa_reg_rub, sample_size, confidence
     ) VALUES (
       $1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
     )
     ON CONFLICT (date, cohort_days) DO UPDATE SET
       registrations = EXCLUDED.registrations,
       payers = EXCLUDED.payers,
       revenue_rub = EXCLUDED.revenue_rub,
       arpu_per_registration_rub = EXCLUDED.arpu_per_registration_rub,
       cr_reg_to_payer = EXCLUDED.cr_reg_to_payer,
       avg_check_rub = EXCLUDED.avg_check_rub,
       max_allowed_cpa_reg_rub = EXCLUDED.max_allowed_cpa_reg_rub,
       sample_size = EXCLUDED.sample_size,
       confidence = EXCLUDED.confidence`,
    [
      asOfDate,
      cohortDays,
      registrations,
      payers,
      revenueRub,
      arpuPerRegistrationRub,
      crRegToPayer,
      avgCheckRub,
      maxAllowedCpaRegRub,
      sampleSize,
      confidence,
    ]
  );

  return snap;
}
