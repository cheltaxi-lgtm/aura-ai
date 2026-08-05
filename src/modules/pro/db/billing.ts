import { chargeForSession, rollbackChargeEx, InsufficientFundsError } from "@/lib/services/billing-service";
import { getRuneBalance } from "@/lib/rune-service";
import { proQuery } from "../db";
import { getProBillingMode } from "../config";
import { proRuneCost, type ProPricedAction } from "../pricing";

export type ProChargeResult = {
  shadow: boolean;
  runes: number;
  ledgerTxnRef: string | null;
  newBalance: number | null;
  deduplicated: boolean;
};

export async function chargeProAction(input: {
  accountId: string | number;
  userId: string;
  action: ProPricedAction;
  caseId?: string | number | null;
  idempotencyKey: string;
  description?: string;
}): Promise<ProChargeResult> {
  const runes = proRuneCost(input.action);
  const mode = getProBillingMode();
  const shadow = mode !== "live";

  const existing = await proQuery<{
    runes: number;
    ledger_txn_ref: string | null;
    shadow: boolean;
  }>(
    `SELECT runes, ledger_txn_ref, shadow FROM pro.usage_log WHERE idempotency_key = $1`,
    [input.idempotencyKey]
  );
  if (existing.rows[0]) {
    const bal = shadow ? null : await getRuneBalance(input.userId);
    return {
      shadow: existing.rows[0].shadow,
      runes: existing.rows[0].runes,
      ledgerTxnRef: existing.rows[0].ledger_txn_ref,
      newBalance: bal,
      deduplicated: true,
    };
  }

  if (runes <= 0) {
    await proQuery(
      `INSERT INTO pro.usage_log (account_id, action, case_id, runes, idempotency_key, shadow)
       VALUES ($1, $2, $3, 0, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [input.accountId, input.action, input.caseId ?? null, input.idempotencyKey, shadow]
    );
    return {
      shadow,
      runes: 0,
      ledgerTxnRef: null,
      newBalance: shadow ? null : await getRuneBalance(input.userId),
      deduplicated: false,
    };
  }

  if (shadow) {
    await proQuery(
      `INSERT INTO pro.usage_log (account_id, action, case_id, runes, idempotency_key, shadow)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [input.accountId, input.action, input.caseId ?? null, runes, input.idempotencyKey]
    );
    return {
      shadow: true,
      runes,
      ledgerTxnRef: null,
      newBalance: null,
      deduplicated: false,
    };
  }

  try {
    const charged = await chargeForSession({
      userId: input.userId,
      cost: runes,
      actionType: `pro_${input.action}`,
      description: input.description ?? `Pro: ${input.action}`,
      idempotencyKey: input.idempotencyKey,
    });
    await proQuery(
      `INSERT INTO pro.usage_log
         (account_id, action, case_id, runes, idempotency_key, ledger_txn_ref, shadow)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        input.accountId,
        input.action,
        input.caseId ?? null,
        charged.spentRunes,
        input.idempotencyKey,
        charged.transactionId ?? null,
      ]
    );
    return {
      shadow: false,
      runes: charged.spentRunes,
      ledgerTxnRef: charged.transactionId ?? null,
      newBalance: charged.newBalance,
      deduplicated: Boolean(charged.deduplicated),
    };
  } catch (e) {
    if (e instanceof InsufficientFundsError) throw e;
    throw e;
  }
}

export async function refundProAction(input: {
  userId: string;
  idempotencyKey: string;
  transactionId?: string | null;
  spentRunes: number;
  shadow: boolean;
}): Promise<void> {
  if (input.shadow || input.spentRunes <= 0) return;
  await rollbackChargeEx({
    userId: input.userId,
    cost: input.spentRunes,
    wasFreeQuestion: false,
    transactionId: input.transactionId ?? undefined,
    actionType: `pro_refund:${input.idempotencyKey}`,
  });
}

export async function getUsageSummary(accountId: string | number): Promise<{
  shadowRunes: number;
  liveRunes: number;
  events: number;
}> {
  const { rows } = await proQuery<{ shadow: boolean; runes: string; n: string }>(
    `SELECT shadow, COALESCE(SUM(runes),0)::text AS runes, COUNT(*)::text AS n
     FROM pro.usage_log WHERE account_id = $1
     GROUP BY shadow`,
    [accountId]
  );
  let shadowRunes = 0;
  let liveRunes = 0;
  let events = 0;
  for (const r of rows) {
    events += Number(r.n);
    if (r.shadow) shadowRunes += Number(r.runes);
    else liveRunes += Number(r.runes);
  }
  return { shadowRunes, liveRunes, events };
}

export { InsufficientFundsError };
