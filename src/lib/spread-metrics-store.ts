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
