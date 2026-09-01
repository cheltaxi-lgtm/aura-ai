import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { query } from "@/lib/db";
import { PALM_DAY_TIMEZONE } from "@/lib/services/palm-guest-service";

const PALM_TODAY_SQL = `(created_at AT TIME ZONE '${PALM_DAY_TIMEZONE}')::date = (NOW() AT TIME ZONE '${PALM_DAY_TIMEZONE}')::date`;

/** 50% off the first completed palm reading for a user. */
export const FIRST_PALM_DISCOUNT_RATIO = 0.5;

export type PalmReadingPricing = {
  baseCost: number;
  effectiveCost: number;
  firstPalmDiscount: boolean;
  palmReadingsCount: number;
};

export async function countUserPalmReadings(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'palm_reading'`,
    [userId]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10) || 0;
}

export async function resolvePalmReadingPricing(userId: string): Promise<PalmReadingPricing> {
  const settings = await getRuneSettings();
  const baseCost = runeCostFromSettings(settings, "PALM_READING");
  const palmReadingsCount = await countUserPalmReadings(userId);
  const firstPalmDiscount = palmReadingsCount === 0;
  const effectiveCost = firstPalmDiscount
    ? Math.max(1, Math.round(baseCost * FIRST_PALM_DISCOUNT_RATIO))
    : baseCost;

  return {
    baseCost,
    effectiveCost,
    firstPalmDiscount,
    palmReadingsCount,
  };
}

export function palmReadingPricingFromSettings(
  palmReadingsCount: number,
  settings?: Awaited<ReturnType<typeof getRuneSettings>>
): PalmReadingPricing {
  const baseCost = settings?.costs
    ? runeCostFromSettings(settings, "PALM_READING")
    : DEFAULT_RUNE_COSTS.PALM_READING;
  const firstPalmDiscount = palmReadingsCount === 0;
  return {
    baseCost,
    effectiveCost: firstPalmDiscount
      ? Math.max(1, Math.round(baseCost * FIRST_PALM_DISCOUNT_RATIO))
      : baseCost,
    firstPalmDiscount,
    palmReadingsCount,
  };
}

export function defaultPalmReadingBaseCost(): number {
  return DEFAULT_RUNE_COSTS.PALM_READING;
}

export type PalmChargeReuseState = {
  amount: number;
  refunded: boolean;
};

export async function getPalmChargeReuseState(
  userId: string,
  transactionId: string
): Promise<PalmChargeReuseState | null> {
  const { rows } = await query<{ amount: string; refunded: boolean }>(
    `SELECT ABS(t.amount)::text AS amount,
            EXISTS (
              SELECT 1 FROM rune_transactions rf
              WHERE rf.type = 'refund' AND rf.refund_of_transaction_id = t.id
            ) AS refunded
     FROM rune_transactions t
     WHERE t.id = $1 AND t.user_id = $2 AND t.type = 'spend'
     LIMIT 1`,
    [transactionId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  return { amount: Number.parseInt(row.amount, 10) || 0, refunded: row.refunded };
}

export async function listTodaysUnrefundedPalmSpends(userId: string): Promise<
  { transactionId: string; idempotencyKey: string | null }[]
> {
  const { rows } = await query<{ id: string; idempotency_key: string | null }>(
    `SELECT t.id, t.idempotency_key
     FROM rune_transactions t
     WHERE t.user_id = $1
       AND t.type = 'spend'
       AND t.action_type = 'PALM_READING'
       AND ${PALM_TODAY_SQL}
       AND NOT EXISTS (
         SELECT 1 FROM rune_transactions rf
         WHERE rf.type = 'refund' AND rf.refund_of_transaction_id = t.id
       )`,
    [userId]
  );
  return rows.map((row) => ({
    transactionId: row.id,
    idempotencyKey: row.idempotency_key,
  }));
}

export async function hasTodaysUnrefundedPalmSpend(userId: string): Promise<boolean> {
  return (await listTodaysUnrefundedPalmSpends(userId)).length > 0;
}

export function palmSpendKeyForSnapshot(snapshotId: string): string {
  return `palm-reading:${snapshotId}`;
}

export function palmSpendKeyBelongsToSnapshot(
  idempotencyKey: string | null | undefined,
  snapshotId: string
): boolean {
  const exact = palmSpendKeyForSnapshot(snapshotId);
  const key = idempotencyKey ?? "";
  return key === exact || key.startsWith(`${exact}:`);
}

/**
 * Charge keys are snapshot-bound. A client/header key from another reading
 * must never replay that spend onto a new snapshot.
 */
export function bindPalmChargeIdempotencyKey(
  snapshotId: string,
  clientKey?: string | null
): string {
  if (palmSpendKeyBelongsToSnapshot(clientKey, snapshotId)) {
    return clientKey!.trim();
  }
  return palmSpendKeyForSnapshot(snapshotId);
}

export function palmSpendBelongsToSnapshot(
  spends: { idempotencyKey: string | null }[],
  snapshotId: string
): boolean {
  return spends.some((s) => palmSpendKeyBelongsToSnapshot(s.idempotencyKey, snapshotId));
}
