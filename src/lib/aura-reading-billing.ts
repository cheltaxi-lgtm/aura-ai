import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { query } from "@/lib/db";
import { AURA_DAY_TIMEZONE } from "@/lib/services/aura-guest-service";

const AURA_TODAY_SQL = `(created_at AT TIME ZONE '${AURA_DAY_TIMEZONE}')::date = (NOW() AT TIME ZONE '${AURA_DAY_TIMEZONE}')::date`;

/** 50% off the first completed aura reading for a user. */
export const FIRST_AURA_DISCOUNT_RATIO = 0.5;

export type AuraReadingPricing = {
  baseCost: number;
  effectiveCost: number;
  firstAuraDiscount: boolean;
  auraReadingsCount: number;
};

export async function countUserAuraReadings(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM history
     WHERE user_id = $1
       AND context_data->>'type' = 'aura_reading'`,
    [userId]
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10) || 0;
}

export async function resolveAuraReadingPricing(userId: string): Promise<AuraReadingPricing> {
  const settings = await getRuneSettings();
  const baseCost = runeCostFromSettings(settings, "AURA_READING");
  const auraReadingsCount = await countUserAuraReadings(userId);
  const firstAuraDiscount = auraReadingsCount === 0;
  const effectiveCost = firstAuraDiscount
    ? Math.max(1, Math.round(baseCost * FIRST_AURA_DISCOUNT_RATIO))
    : baseCost;

  return {
    baseCost,
    effectiveCost,
    firstAuraDiscount,
    auraReadingsCount,
  };
}

export function auraReadingPricingFromSettings(
  auraReadingsCount: number,
  settings?: Awaited<ReturnType<typeof getRuneSettings>>
): AuraReadingPricing {
  const baseCost = settings?.costs
    ? runeCostFromSettings(settings, "AURA_READING")
    : DEFAULT_RUNE_COSTS.AURA_READING;
  const firstAuraDiscount = auraReadingsCount === 0;
  return {
    baseCost,
    effectiveCost: firstAuraDiscount
      ? Math.max(1, Math.round(baseCost * FIRST_AURA_DISCOUNT_RATIO))
      : baseCost,
    firstAuraDiscount,
    auraReadingsCount,
  };
}

export function defaultAuraReadingBaseCost(): number {
  return DEFAULT_RUNE_COSTS.AURA_READING;
}

export type AuraChargeReuseState = {
  /** Absolute rune amount of the original spend. */
  amount: number;
  /** True when a linked refund row already exists for the spend. */
  refunded: boolean;
};

/**
 * State of a prior deduplicated charge: still held (crash/requeue → reuse it)
 * or refunded (money returned → the retry must charge again under a fresh key).
 */
export async function getAuraChargeReuseState(
  userId: string,
  transactionId: string
): Promise<AuraChargeReuseState | null> {
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

/**
 * A held (not refunded) AURA_READING spend today — even if the history row
 * was deleted. Blocks a second charge until the next Moscow calendar day.
 */
export async function listTodaysUnrefundedAuraSpends(userId: string): Promise<
  { transactionId: string; idempotencyKey: string | null }[]
> {
  const { rows } = await query<{ id: string; idempotency_key: string | null }>(
    `SELECT t.id, t.idempotency_key
     FROM rune_transactions t
     WHERE t.user_id = $1
       AND t.type = 'spend'
       AND t.action_type = 'AURA_READING'
       AND ${AURA_TODAY_SQL}
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

export async function hasTodaysUnrefundedAuraSpend(userId: string): Promise<boolean> {
  return (await listTodaysUnrefundedAuraSpends(userId)).length > 0;
}

/** Held spend for this snapshot (stable key or per-attempt retry key). */
export function auraSpendBelongsToSnapshot(
  spends: { idempotencyKey: string | null }[],
  snapshotId: string
): boolean {
  const exact = `aura-reading:${snapshotId}`;
  const prefix = `${exact}:`;
  return spends.some((s) => {
    const key = s.idempotencyKey ?? "";
    return key === exact || key.startsWith(prefix);
  });
}
