import { adsQuery } from "./db";

export async function rollupFunnelDaily(day?: string): Promise<number> {
  const date = day || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await adsQuery(
    `INSERT INTO ads.funnel_daily AS f
      (date, campaign_id, clicks, deck_views, spread_submits, teaser_views,
       registrations, claims, first_payments, revenue_rub)
     SELECT
       $1::date,
       0,
       (SELECT COUNT(*) FROM ads.click WHERE created_at::date = $1::date),
       (SELECT COUNT(*) FROM ads.conversion WHERE type='deck_view' AND occurred_at::date = $1::date),
       (SELECT COUNT(*) FROM ads.conversion WHERE type='spread_submit' AND occurred_at::date = $1::date),
       (SELECT COUNT(*) FROM ads.conversion WHERE type='teaser_view' AND occurred_at::date = $1::date),
       (SELECT COUNT(*) FROM ads.conversion WHERE type='registration' AND occurred_at::date = $1::date),
       (SELECT COUNT(*) FROM ads.conversion WHERE type='claim' AND occurred_at::date = $1::date),
       (SELECT COUNT(*) FROM ads.conversion WHERE type='first_payment' AND occurred_at::date = $1::date),
       COALESCE((SELECT SUM(amount_rub) FROM ads.conversion
         WHERE type IN ('first_payment','repeat_payment') AND occurred_at::date = $1::date), 0)
     ON CONFLICT (date, campaign_id) DO UPDATE SET
       clicks = EXCLUDED.clicks,
       deck_views = EXCLUDED.deck_views,
       spread_submits = EXCLUDED.spread_submits,
       teaser_views = EXCLUDED.teaser_views,
       registrations = EXCLUDED.registrations,
       claims = EXCLUDED.claims,
       first_payments = EXCLUDED.first_payments,
       revenue_rub = EXCLUDED.revenue_rub`,
    [date]
  );
  return 1;
}
