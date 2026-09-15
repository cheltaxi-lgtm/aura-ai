import { isFirstExperienceEnabled } from "@/lib/first-experience-policy";
import { queryClient, type PoolClient } from "@/lib/db";
import { ensureDb } from "@/lib/db";
import { query } from "@/lib/db";
import type { SpreadMetricEvent, SpreadMetricPayload } from "@/lib/spreads/metrics";

export async function recordSpreadMetric(
  event: SpreadMetricEvent,
  payload: SpreadMetricPayload,
  userId?: string | null
): Promise<void> {
  if (!(await ensureDb())) return;

  await query(
    `INSERT INTO spread_metrics
       (event, spread_id, intention, character_id, card_count, cost, source, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event,
      payload.spreadId,
      payload.intention ?? null,
      payload.characterId ?? null,
      payload.cardCount ?? null,
      payload.cost ?? null,
      payload.source ?? null,
      userId ?? null,
    ]
  );
}

export async function getSpreadMetricsSummary(days = 30): Promise<
  { spreadId: string; event: string; count: number }[]
> {
  if (!(await ensureDb())) return [];

  const { rows } = await query<{ spread_id: string; event: string; count: string }>(
    `SELECT spread_id, event, COUNT(*)::text AS count
     FROM spread_metrics
     WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
       AND source IS DISTINCT FROM 'first_experience'
       AND source IS DISTINCT FROM 'guest_registration_funnel'
     GROUP BY spread_id, event
     ORDER BY COUNT(*) DESC, spread_id ASC
     LIMIT 40`,
    [String(days)]
  );

  return rows.map((row) => ({
    spreadId: row.spread_id,
    event: row.event,
    count: parseInt(row.count, 10) || 0,
  }));
}

export type JourneyEvent = "bonus_granted" | "bonus_spent" | "bonus_refunded" | "first_result" | "continuation_shown" | "continuation_selected" | "insight_saved" | "step_saved" | "changes_saved" | "payment_started" | "first_topup" | "repeat_topup";
/** Internal existing metrics store. Never accepts questions, report text or arbitrary metadata. */
export async function recordJourneyEvent(userId: string, event: JourneyEvent, key: string, data: { product?: string; runes?: number; amountRub?: number; bonusVersion?: string } = {}, client?: PoolClient) {
  if (!isFirstExperienceEnabled()) return;
  const sql = `INSERT INTO spread_metrics(user_id,event,spread_id,source,idempotency_key,metadata)
    VALUES($1,$2,'journey','first_experience',$3,$4::jsonb)
    ON CONFLICT(user_id,event,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`;
  const params = [userId,event,key,JSON.stringify(data)];
  if (client) await queryClient(client,sql,params); else await query(sql,params);
}
