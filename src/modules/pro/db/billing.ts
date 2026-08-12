import { chargeForSession, rollbackChargeEx, InsufficientFundsError } from "@/lib/services/billing-service";
import { getRuneBalance } from "@/lib/rune-service";
import { proQuery } from "../db";
import { getProBillingMode, isProTrialEnforced } from "../config";
import { proRuneCost, type ProPricedAction } from "../pricing";

export type ProChargeResult = {
  shadow: boolean;
  runes: number;
  ledgerTxnRef: string | null;
  newBalance: number | null;
  deduplicated: boolean;
};

export class ProTrialExceededError extends Error {
  constructor(public readonly reason: "expired" | "runes_exhausted") {
    super(`pro_trial_${reason}`);
    this.name = "ProTrialExceededError";
  }
}

export type ProTrialState = {
  tier: string;
  enforced: boolean;
  trialEndsAt: string | null;
  trialRunes: number;
  spentRunes: number;
  runesLeft: number | null;
  daysLeft: number | null;
  blocked: boolean;
  blockReason: "expired" | "runes_exhausted" | null;
};

export async function getProTrialState(accountId: string | number): Promise<ProTrialState | null> {
  const { rows } = await proQuery<{
    tier: string;
    limits: Record<string, unknown> | null;
    spent: number;
  }>(
    `SELECT a.tier, a.limits,
            (SELECT COALESCE(SUM(u.runes), 0)::int FROM pro.usage_log u WHERE u.account_id = a.id) AS spent
     FROM pro.accounts a
     WHERE a.id = $1 AND a.deleted_at IS NULL
     LIMIT 1`,
    [accountId]
  );
  const acc = rows[0];
  if (!acc) return null;
  const limits = acc.limits ?? {};
  const trialEndsAt =
    typeof limits.trial_ends_at === "string" ? limits.trial_ends_at : null;
  const trialRunes = Number(limits.trial_runes ?? 0) || 0;
  const spentRunes = Number(acc.spent ?? 0);
  const endsMs = trialEndsAt ? Date.parse(trialEndsAt) : NaN;
  const expired = Number.isFinite(endsMs) && endsMs < Date.now();
  const runesLeft = trialRunes > 0 ? Math.max(0, trialRunes - spentRunes) : null;
  const runesExhausted = trialRunes > 0 && spentRunes >= trialRunes;
  const daysLeft = Number.isFinite(endsMs)
    ? Math.max(0, Math.ceil((endsMs - Date.now()) / 86_400_000))
    : null;
  const blocked = acc.tier === "free_trial" && (expired || runesExhausted);
  return {
    tier: acc.tier,
    enforced: isProTrialEnforced(),
    trialEndsAt,
    trialRunes,
    spentRunes,
    runesLeft,
    daysLeft,
    blocked,
    blockReason: blocked ? (expired ? "expired" : "runes_exhausted") : null,
  };
}

/** Throws ProTrialExceededError when an enforced trial account may not spend. */
async function assertTrialAllowsCharge(
  accountId: string | number,
  runes: number
): Promise<void> {
  const state = await getProTrialState(accountId);
  if (!state || state.tier !== "free_trial") return;
  if (state.blockReason === "expired") throw new ProTrialExceededError("expired");
  if (
    state.trialRunes > 0 &&
    state.spentRunes + runes > state.trialRunes
  ) {
    throw new ProTrialExceededError("runes_exhausted");
  }
}

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
    if (isProTrialEnforced()) await assertTrialAllowsCharge(input.accountId, 0);
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

  if (isProTrialEnforced()) await assertTrialAllowsCharge(input.accountId, runes);

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
