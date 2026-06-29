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
