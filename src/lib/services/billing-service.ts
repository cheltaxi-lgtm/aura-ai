import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { normalizeChargeIdempotencyKey } from "@/lib/charge-idempotency-key";
export { normalizeChargeIdempotencyKey } from "@/lib/charge-idempotency-key";
import { isFirstExperienceEnabled } from "@/lib/first-experience-policy";
import { recordJourneyEvent } from "@/lib/spread-metrics-store";

import { queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { RUNE_ACTION_LABELS, type RuneActionType } from "@/lib/rune-costs";
import {
  getRuneBalance,
  isRuneBillingActive,
  refundRunes,
} from "@/lib/rune-service";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import {
  decrementQuestionCount,
  getSession,
  hasPaidAccess,
  incrementQuestionCount,
  reserveQuestionSlot,
  type SessionRow,
} from "@/lib/session";
import {
  isSessionChatQuestionCapReached,
  SESSION_CHAT_LIMIT_MESSAGE,
  SESSION_CHAT_QUESTION_LIMIT,
} from "@/lib/session-limits";

/** Thrown when the consultation session reached the chat question cap. */
export class SessionQuestionLimitError extends Error {
  readonly code = "SESSION_QUESTION_LIMIT";

  constructor(message = SESSION_CHAT_LIMIT_MESSAGE) {
    super(message);
    this.name = "SessionQuestionLimitError";
  }
}

/** Thrown when neither free questions nor rune balance cover the charge. Maps to HTTP 402. */
export class InsufficientFundsError extends Error {
  readonly code = "INSUFFICIENT_FUNDS";

  constructor(
    public readonly balance: number,
    public readonly required: number,
    message?: string
  ) {
    super(message ?? `Insufficient funds: need ${required}, have ${balance}`);
    this.name = "InsufficientFundsError";
  }
}

/** The atomic charge would exceed the amount the caller explicitly confirmed. */
export class ConfirmedCostExceededError extends Error {
  readonly code = "CONFIRMED_COST_EXCEEDED";

  constructor(public readonly confirmed: number, public readonly actual: number) {
    super(`Confirmed cost ${confirmed} is below actual cost ${actual}`);
    this.name = "ConfirmedCostExceededError";
  }
}

export type BillingChargeResult = {
  spentRunes: number;
  wasFreeQuestion: boolean;
  newBalance: number;
  actionType: string;
  sessionId?: string;
  slotReserved: boolean;
  questionIndex?: number;
  freeQuestionsRemaining?: number;
  /** rune_transactions.id when this charge wrote a ledger row (paid path only). */
  transactionId?: string;
  /** True when an existing ledger row for the same idempotency key was reused (no second debit). */
  deduplicated?: boolean;
};

export type ChargeForSessionParams = {
  userId: string;
  cost: number;
  actionType: string;
  description?: string;
  /** Skip charge (daily spread, cached reuse, unlimited). */
  exempt?: boolean;
  /** Chat: reserve session slot and apply free-question tier. */
  sessionId?: string;
  /** Photo purchase is bound to its server content key; session is an output receipt. */
  sessionIsResult?: boolean;
  freeQuestionLimit?: number;
  hasFullAccess?: boolean;
  reserveFreeSlot?: boolean;
  client?: PoolClient;
  /**
   * Optional caller-supplied idempotency key (Idempotency-Key / requestId).
   * When omitted, a short-window deterministic fallback is derived so double-submit
   * from legacy Capacitor clients still collapses (see CHARGE_IDEM_WINDOW_SEC).
   */
  idempotencyKey?: string;
  /** Trusted server operation/content identity; price must not participate. */
  operationIdentity?: string;
  /** Old unbound keys: fail safely when a held payment cannot be tied to this input. */
  legacyIdempotencyKeys?: string[];
  /** Refuse the transaction when the payable amount exceeds explicit user confirmation. */
  maxCost?: number;
};

/**
 * Double-submit window for server-derived charge keys when the caller omits an
 * explicit Idempotency-Key. Distinct intentional charges inside this window must
 * pass distinct keys (or wait for the next bucket).
 */
export const CHARGE_IDEM_WINDOW_SEC = 30;

/** Deterministic fallback key from stable charge traits + time bucket (not a random nonce). */
export function buildFallbackChargeIdempotencyKey(input: {
  userId: string;
  actionType: string;
  sessionId?: string | null;
  cost: number;
  nowMs?: number;
}): string {
  const bucket = Math.floor(
    (input.nowMs ?? Date.now()) / (CHARGE_IDEM_WINDOW_SEC * 1000)
  );
  const sessionPart = input.sessionId?.trim() || "-";
  return `auto:${input.userId}:${input.actionType}:${sessionPart}:${input.cost}:${bucket}`;
}

/** Prefer Idempotency-Key header, then body.idempotencyKey / body.requestId. */
export function readRequestChargeIdempotencyKey(
  request: { headers: { get(name: string): string | null } },
  body?: { idempotencyKey?: unknown; requestId?: unknown } | null
): string | undefined {
  const fromHeader = request.headers.get("Idempotency-Key");
  const fromBody =
    typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey
      : typeof body?.requestId === "string"
        ? body.requestId
        : undefined;
  return normalizeChargeIdempotencyKey(fromHeader) ??
    normalizeChargeIdempotencyKey(fromBody) ??
    undefined;
}

function resolveEffectiveChargeIdempotencyKey(
  params: ChargeForSessionParams
): string | null {
  const explicit = normalizeChargeIdempotencyKey(params.idempotencyKey);
  if (explicit) return explicit;
  // Centralized phase-3.5 fallback so telegram/direct callers get double-click safety.
  return buildFallbackChargeIdempotencyKey({
    userId: params.userId,
    actionType: params.actionType,
    sessionId: params.sessionId,
    cost: params.cost,
  });
}

export type RollbackChargeParams = {
  client?: PoolClient;
  userId: string;
  cost: number;
  wasFreeQuestion: boolean;
  transactionId?: string;
  sessionId?: string;
  slotReserved?: boolean;
  actionType?: string;
};

async function lockUserRow(
  client: PoolClient,
  userId: string,
  requireActive = false
): Promise<number> {
  const { rows } = await queryClient<{ rune_balance: number; erasure_requested_at?: Date | null }>(
    client,
    `SELECT rune_balance, erasure_requested_at FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  if (!rows[0]) throw new Error("user_not_found");
  if (requireActive && rows[0].erasure_requested_at) throw new Error("billing_profile_inactive");
  return rows[0].rune_balance;
}

async function logFreeQuestionSpend(
  client: PoolClient,
  userId: string,
  balanceAfter: number,
  actionType: string,
  idempotencyKey: string | null,
  sessionId: string,
  operationIdentity: string | null
): Promise<string> {
  const {rows} = await queryClient<{id:string}>(
    client,
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type, idempotency_key, result_session_id, operation_identity)
     VALUES ($1, 'spend', 0, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, balanceAfter, "Списан бесплатный вопрос", actionType, idempotencyKey, sessionId, operationIdentity]
  );
  return rows[0].id;
}

type PriorSpend = {
  id: string;
  amount: number;
  balance_after: number;
  action_type: string | null;
  result_session_id: string | null;
  refunded: boolean;
  idempotency_key: string;
  operation_identity: string | null;
};

function operationFingerprint(params: ChargeForSessionParams): string | null {
  return params.operationIdentity ? createHash("sha256").update(params.operationIdentity).digest("hex") : null;
}

async function findSpendByIdempotencyKey(
  client: PoolClient,
  userId: string,
  idempotencyKey: string
): Promise<PriorSpend | null> {
  const { rows } = await queryClient<PriorSpend>(
    client,
    `SELECT t.id, t.amount, t.balance_after, t.action_type, t.result_session_id, t.idempotency_key, t.operation_identity,
       EXISTS (SELECT 1 FROM rune_transactions rf WHERE rf.type='refund' AND rf.refund_of_transaction_id=t.id) AS refunded
     FROM rune_transactions t
     WHERE t.user_id = $1 AND t.idempotency_key = $2 AND t.type = 'spend'
     LIMIT 1`,
    [userId, idempotencyKey]
  );
  return rows[0] ?? null;
}

/** A legacy client key has a held receipt but no evidence of this session. */
export class BillingIdempotencyConflictError extends Error {
  readonly code = "BILLING_IDEMPOTENCY_CONFLICT";
  constructor() {
    super("The payment key belongs to an ambiguous previous purchase");
    this.name = "BillingIdempotencyConflictError";
  }
}

export function billingIdempotencyConflictResponse(): NextResponse {
  return NextResponse.json({ error: "payment_key_conflict", code: "payment_key_conflict",
    message: "Для этого запроса уже есть оплата, но повторный результат не подтверждён. Откройте сохранённый результат. Новое списание не выполнено." }, { status: 409 });
}

function isHeldSpendForCharge(prior: PriorSpend, params: ChargeForSessionParams): boolean {
  if (prior.refunded || prior.action_type !== params.actionType || prior.amount > 0) return false;
  if ((prior.operation_identity ?? null) !== operationFingerprint(params)) return false;
  if (params.sessionId && !params.sessionIsResult && prior.result_session_id !== params.sessionId) {
    // Older server-derived chat/fallback keys already bind the session. An
    // ambiguous client key with no saved session cannot authorize another one.
    const legacyBound = prior.result_session_id === null &&
      (prior.idempotency_key.startsWith(`chat:${params.sessionId}:`) ||
       prior.idempotency_key.startsWith(`auto:${params.userId}:${params.actionType}:${params.sessionId}:`));
    if (!legacyBound) return false;
  }
  if (prior.amount === 0) {
    return params.actionType === "QUESTION" && params.reserveFreeSlot === true &&
      Boolean(params.sessionId);
  }
  // The already-purchased operation retains its original price, including
  // first-reading discounts and admin price changes. No new debit is made.
  return true;
}

/** Keep old keys/receipts intact; collisions and refunded attempts never grant a purchase. */
async function resolveHeldCharge(
  client: PoolClient,
  params: ChargeForSessionParams,
  originalKey: string
): Promise<{ key: string; prior: PriorSpend | null }> {
  const original = await findSpendByIdempotencyKey(client, params.userId, originalKey);
  if (!original) {
    for (const raw of (params.legacyIdempotencyKeys ?? []).slice(0, 4)) {
      const key = normalizeChargeIdempotencyKey(raw);
      if (!key || key === originalKey) continue;
      const legacy = await findSpendByIdempotencyKey(client, params.userId, key);
      if (legacy && !legacy.refunded && legacy.action_type === params.actionType && legacy.amount < 0) {
        if (params.operationIdentity && isHeldSpendForCharge(legacy, params)) return { key, prior: legacy };
        throw new BillingIdempotencyConflictError();
      }
    }
    return { key: originalKey, prior: null };
  }
  if (isHeldSpendForCharge(original, params)) return { key: originalKey, prior: original };
  if (!original.refunded && original.amount < 0 && original.action_type === params.actionType &&
      ((params.operationIdentity && !original.operation_identity) || (!params.operationIdentity && original.operation_identity))) {
    throw new BillingIdempotencyConflictError();
  }
  if (!original.refunded && original.amount < 0 && original.action_type === params.actionType &&
      params.sessionId && !params.sessionIsResult && original.result_session_id === null) {
    throw new BillingIdempotencyConflictError();
  }

  const identity = createHash("sha256")
    .update(JSON.stringify([originalKey, params.actionType, params.sessionIsResult ? null : params.sessionId ?? null, operationFingerprint(params)]))
    .digest("hex");
  // Keep the server resource prefix: daily Aura/Palm held-spend ownership
  // checks and old retry helpers deliberately use that prefix.
  const prefix = `${originalKey}:billing-retry:${identity.slice(0, 24)}:`;
  const { rows } = await queryClient<PriorSpend>(client,
    `SELECT t.id, t.amount, t.balance_after, t.action_type, t.result_session_id, t.idempotency_key, t.operation_identity,
       EXISTS (SELECT 1 FROM rune_transactions rf WHERE rf.type='refund' AND rf.refund_of_transaction_id=t.id) AS refunded
     FROM rune_transactions t
     WHERE t.user_id=$1 AND t.type='spend' AND LEFT(t.idempotency_key,LENGTH($2))=$2
       AND SUBSTRING(t.idempotency_key FROM LENGTH($2)+1) ~ '^[0-9]{1,10}$'
     ORDER BY SUBSTRING(t.idempotency_key FROM LENGTH($2)+1)::bigint DESC LIMIT 1`,
    [params.userId, prefix]);
  const latest = rows[0] ?? null;
  if (latest && isHeldSpendForCharge(latest, params)) return { key: latest.idempotency_key, prior: latest };
  if (latest && !latest.refunded && latest.amount < 0 && latest.action_type === params.actionType &&
      ((params.operationIdentity && !latest.operation_identity) || (!params.operationIdentity && latest.operation_identity))) {
    throw new BillingIdempotencyConflictError();
  }
  const attempt = latest ? Number(latest.idempotency_key.slice(prefix.length)) + 1 : 1;
  if (!Number.isSafeInteger(attempt) || attempt > 9_999_999_999) throw new Error("billing_retry_limit");
  return { key: `${prefix}${attempt}`, prior: null };
}

/**
 * Insert spend ledger row. With idempotencyKey uses ON CONFLICT (DB unique index)
 * like creditRunesFromPayment / payment_id — race-safe without SELECT-then-INSERT alone.
 */
async function logRuneSpend(
  client: PoolClient,
  userId: string,
  amount: number,
  balanceAfter: number,
  description: string,
  actionType: string,
  idempotencyKey: string | null,
  sessionId?: string,
  operationIdentity: string | null = null
): Promise<{ transactionId?: string; conflict: boolean }> {
  if (idempotencyKey) {
    const { rows } = await queryClient<{ id: string }>(
      client,
      `INSERT INTO rune_transactions
         (user_id, type, amount, balance_after, description, action_type, idempotency_key, result_session_id, operation_identity)
       VALUES ($1, 'spend', $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [userId, -amount, balanceAfter, description, actionType, idempotencyKey, sessionId ?? null, operationIdentity]
    );
    if (!rows[0]) return { conflict: true };
    return { transactionId: rows[0].id, conflict: false };
  }

  const { rows } = await queryClient<{ id: string }>(
    client,
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type, result_session_id, operation_identity)
     VALUES ($1, 'spend', $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, -amount, balanceAfter, description, actionType, sessionId ?? null, operationIdentity]
  );
  return { transactionId: rows[0]?.id, conflict: false };
}

async function reserveQuestionIndex(
  client: PoolClient,
  sessionId: string,
  userId: string,
  freeLimit: number,
  hasFullAccess: boolean,
  cost: number,
  maxCost?: number
): Promise<{ questionIndex: number; freeQuestionsRemaining: number }> {
  const owned = await queryClient(client, `SELECT id FROM sessions WHERE id = $1 AND user_id=$2 FOR UPDATE`, [sessionId, userId]);
  if (!owned.rowCount) throw new Error("billing_session_not_found");

  const { rows: capRows } = await queryClient<{ free_questions_used: number }>(
    client,
    `SELECT free_questions_used FROM sessions WHERE id = $1`,
    [sessionId]
  );
  if (isSessionChatQuestionCapReached(capRows[0]?.free_questions_used)) {
    throw new SessionQuestionLimitError();
  }

  const free = !hasFullAccess && (capRows[0]?.free_questions_used ?? 0) < freeLimit;
  if (!free && maxCost !== undefined && cost > maxCost) throw new ConfirmedCostExceededError(maxCost, cost);

  let used: number;
  if (hasFullAccess) {
    used = await incrementQuestionCount(sessionId, client);
  } else {
    const { rows } = await queryClient<{ free_questions_used: number }>(
      client,
      `UPDATE sessions
       SET free_questions_used = free_questions_used + 1, updated_at = NOW()
       WHERE id = $1 AND free_questions_used < $2
       RETURNING free_questions_used`,
      [sessionId, freeLimit]
    );
    if (rows[0]) {
      used = rows[0].free_questions_used;
    } else {
      used = await incrementQuestionCount(sessionId, client);
    }
  }

  return {
    questionIndex: used - 1,
    freeQuestionsRemaining: Math.max(0, freeLimit - used),
  };
}

async function executeChargeForSession(
  client: PoolClient,
  params: ChargeForSessionParams
): Promise<BillingChargeResult> {
  const {
    userId,
    cost,
    actionType,
    description,
    exempt,
    sessionId,
    freeQuestionLimit = 2,
    hasFullAccess = false,
    reserveFreeSlot = false,
  } = params;

  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error("invalid_billing_cost");
  if (params.operationIdentity !== undefined && (typeof params.operationIdentity !== "string" ||
      !params.operationIdentity || params.operationIdentity.length > 1024)) throw new Error("invalid_billing_operation_identity");
  if (params.maxCost !== undefined && (!Number.isFinite(params.maxCost) || params.maxCost < 0)) {
    throw new Error("invalid_confirmed_billing_cost");
  }
  let idempotencyKey = resolveEffectiveChargeIdempotencyKey(params);
  const balance = await lockUserRow(client, userId, true);

  if (exempt) {
    return {
      spentRunes: 0,
      wasFreeQuestion: false,
      newBalance: balance,
      actionType,
      sessionId,
      slotReserved: false,
    };
  }

  // Fast path under user lock: prior successful spend with this key → no second debit.
  if (idempotencyKey) {
    const resolved = await resolveHeldCharge(client, params, idempotencyKey);
    idempotencyKey = resolved.key;
    const prior = resolved.prior;
    if (prior) {
      return {
        spentRunes: 0,
        wasFreeQuestion: false,
        newBalance: balance,
        actionType,
        sessionId,
        slotReserved: false,
        transactionId: prior.id,
        deduplicated: true,
      };
    }
  }

  let slotReserved = false;
  let questionIndex: number | undefined;
  let freeQuestionsRemaining: number | undefined;

  if (sessionId && reserveFreeSlot) {
    const reserved = await reserveQuestionIndex(
      client,
      sessionId,
      userId,
      freeQuestionLimit,
      hasFullAccess,
      cost,
      params.maxCost
    );
    questionIndex = reserved.questionIndex;
    freeQuestionsRemaining = reserved.freeQuestionsRemaining;
    slotReserved = true;

    if (!hasFullAccess && questionIndex < freeQuestionLimit) {
      const transactionId=await logFreeQuestionSpend(client, userId, balance, actionType,idempotencyKey,sessionId,operationFingerprint(params));
      return {
        spentRunes: 0,
        wasFreeQuestion: true,
        transactionId,
        newBalance: balance,
        actionType,
        sessionId,
        slotReserved,
        questionIndex,
        freeQuestionsRemaining,
      };
    }
  }

  if (typeof params.maxCost === "number" && cost > params.maxCost) {
    throw new ConfirmedCostExceededError(params.maxCost, cost);
  }

  if (cost <= 0) {
    return {
      spentRunes: 0,
      wasFreeQuestion: false,
      newBalance: balance,
      actionType,
      sessionId,
      slotReserved,
      questionIndex,
      freeQuestionsRemaining,
    };
  }

  const { rows } = await queryClient<{ new_balance: number; success: boolean }>(
    client,
    `WITH updated AS (
       UPDATE users
       SET rune_balance = rune_balance - $2
       WHERE id = $1 AND rune_balance >= $2
       RETURNING rune_balance AS new_balance
     )
     SELECT
       COALESCE((SELECT new_balance FROM updated), -1) AS new_balance,
       EXISTS (SELECT 1 FROM updated) AS success`,
    [userId, cost]
  );

  const success = rows[0]?.success ?? false;
  if (!success) {
    if (slotReserved && sessionId) {
      await queryClient(
        client,
        `UPDATE sessions
         SET free_questions_used = GREATEST(0, free_questions_used - 1), updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );
    }
    // No ledger row on failure — same key may retry and must error again, not "cached success".
    throw new InsufficientFundsError(balance, cost);
  }

  const newBalance = rows[0]!.new_balance;
  const label =
    description ??
    (actionType in RUNE_ACTION_LABELS
      ? RUNE_ACTION_LABELS[actionType as RuneActionType]
      : actionType);

  const logged = await logRuneSpend(
    client,
    userId,
    cost,
    newBalance,
    label,
    actionType,
    idempotencyKey,
    sessionId,
    operationFingerprint(params)
  );

  if (logged.conflict) {
    // Race: another txn won the unique index — undo our debit and return the first spend.
    await queryClient(
      client,
      `UPDATE users SET rune_balance = rune_balance + $2 WHERE id = $1`,
      [userId, cost]
    );
    if (slotReserved && sessionId) {
      await queryClient(
        client,
        `UPDATE sessions
         SET free_questions_used = GREATEST(0, free_questions_used - 1), updated_at = NOW()
         WHERE id = $1`,
        [sessionId]
      );
    }
    const prior = await findSpendByIdempotencyKey(client, userId, idempotencyKey!);
    if (!prior || !isHeldSpendForCharge(prior, params)) throw new Error("billing_idempotency_conflict");
    const restoredBalance = await lockUserRow(client, userId);
    return {
      spentRunes: 0,
      wasFreeQuestion: false,
      newBalance: restoredBalance,
      actionType,
      sessionId,
      slotReserved: false,
      transactionId: prior?.id,
      deduplicated: true,
    };
  }

  if (isFirstExperienceEnabled() && logged.transactionId) {
    const gift = await queryClient<{remaining:string}>(client,`SELECT GREATEST(0,COALESCE(SUM(CASE WHEN event IN ('bonus_granted','bonus_refunded') THEN (metadata->>'runes')::numeric WHEN event='bonus_spent' THEN -(metadata->>'runes')::numeric ELSE 0 END),0))::text AS remaining FROM spread_metrics WHERE user_id=$1 AND source='first_experience'`,[userId]);
    const giftSpent=Math.min(cost,Number(gift.rows[0]?.remaining??0));
    if(giftSpent>0) await recordJourneyEvent(userId,"bonus_spent",logged.transactionId,{runes:giftSpent},client);
  }

  return {
    spentRunes: cost,
    wasFreeQuestion: false,
    newBalance,
    actionType,
    sessionId,
    slotReserved,
    questionIndex,
    freeQuestionsRemaining,
    transactionId: logged.transactionId,
  };
}

/**
 * Atomic charge: lock user row, apply free-question tier or deduct runes, write ledger.
 */
export async function chargeForSession(
  params: ChargeForSessionParams
): Promise<BillingChargeResult> {
  if (params.client) {
    return executeChargeForSession(params.client, params);
  }
  return withTransaction((client) => executeChargeForSession(client, params));
}

/** Refund runes or free-question slot after failed LLM generation. */
export async function rollbackCharge(params: RollbackChargeParams): Promise<number> {
  return (await rollbackChargeEx(params)).balance;
}

/**
 * Same as rollbackCharge but reports whether the refund actually landed, so
 * API responses never claim "refunded: true" after a failed refund.
 */
export async function rollbackChargeEx(
  params: RollbackChargeParams
): Promise<{ balance: number; refunded: boolean }> {
  const {
    userId,
    cost,
    transactionId,
    sessionId,
    slotReserved,
    actionType,
  } = params;

  let refunded = false;

  if (slotReserved && sessionId && cost===0) {
    try {
      if(transactionId) {
        const restoreSlot = async (client: PoolClient) => {
          const balance=await lockUserRow(client,userId);
          const claim=await queryClient(client,`INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,refund_of_transaction_id)
            SELECT $1,'refund',0,$2,'Возврат бесплатного вопроса',id FROM rune_transactions WHERE id=$3 AND user_id=$1 AND type='spend' AND amount=0
            ON CONFLICT(refund_of_transaction_id) WHERE type='refund' AND refund_of_transaction_id IS NOT NULL DO NOTHING RETURNING id`,[userId,balance,transactionId]);
          if(claim.rowCount)await queryClient(client,"UPDATE sessions SET free_questions_used=GREATEST(0,free_questions_used-1),updated_at=NOW() WHERE id=$1 AND user_id=$2",[sessionId,userId]);
        };
        if (params.client) await restoreSlot(params.client);
        else await withTransaction(restoreSlot);
      }else await decrementQuestionCount(sessionId);
      refunded = true;
    } catch (err) {
      console.error("[BillingService] slot rollback failed:", err);
      if (params.client) throw err;
    }
  }

  if (cost > 0) {
    try {
      const balance = await refundRunes(
        userId,
        cost,
        "Возврат: ошибка генерации",
        actionType as RuneActionType | undefined,
        transactionId,
        slotReserved ? sessionId : undefined,
        params.client
      );
      return { balance, refunded: true };
    } catch (err) {
      console.error("[BillingService] rune rollback failed:", err);
      if (params.client) throw err;
      return { balance: await getRuneBalance(userId), refunded: false };
    }
  }

  return { balance: await getRuneBalance(userId, params.client), refunded };
}

/** Charge by configured action type (READING, QUESTION, etc.). */
export async function chargeRuneAction(params: {
  userId: string;
  action: RuneActionType;
  exempt?: boolean;
  sessionId?: string;
  freeQuestionLimit?: number;
  hasFullAccess?: boolean;
  reserveFreeSlot?: boolean;
  client?: PoolClient;
  idempotencyKey?: string;
  operationIdentity?: string;
  legacyIdempotencyKeys?: string[];
  maxCost?: number;
}): Promise<BillingChargeResult> {
  const settings = await getRuneSettings(params.client);
  const cost = runeCostFromSettings(settings, params.action);
  return chargeForSession({
    userId: params.userId,
    cost,
    actionType: params.action,
    exempt: params.exempt,
    sessionId: params.sessionId,
    freeQuestionLimit: params.freeQuestionLimit ?? settings.freeQuestions,
    hasFullAccess: params.hasFullAccess,
    reserveFreeSlot: params.reserveFreeSlot,
    client: params.client,
    idempotencyKey: params.idempotencyKey,
    operationIdentity: params.operationIdentity,
    legacyIdempotencyKeys: params.legacyIdempotencyKeys,
    maxCost: params.maxCost,
  });
}

export function insufficientFundsResponse(err: InsufficientFundsError): NextResponse {
  return insufficientRunesResponse(err.balance, err.required);
}

/**
 * Cheap balance pre-check BEFORE an expensive LLM call in generate-first flows:
 * throws InsufficientFundsError early so broke users never burn model tokens.
 * The authoritative, race-safe charge still happens later via chargeRuneAction.
 */
export async function ensureSufficientRunes(params: {
  userId: string;
  action: RuneActionType;
  exempt?: boolean;
}): Promise<void> {
  if (params.exempt) return;
  const settings = await getRuneSettings();
  const cost = runeCostFromSettings(settings, params.action);
  if (cost <= 0) return;
  const balance = await getRuneBalance(params.userId);
  if (balance < cost) {
    throw new InsufficientFundsError(balance, cost);
  }
}

export const BillingService = {
  chargeForSession,
  chargeRuneAction,
  ensureSufficientRunes,
  rollbackCharge,
  rollbackChargeEx,
  InsufficientFundsError,
};

// --- Chat billing (legacy paywall + unified rune path) ---

export interface ChatBillingState {
  questionIndex: number;
  runeBalance?: number;
  freeQuestionsRemaining?: number;
  sessionHasFullAccess: boolean;
  useRuneBilling: boolean;
  charge?: BillingChargeResult;
}

export interface ChatBillingHandle extends ChatBillingState {
  rollbackLlmFailure(): Promise<{ runesRefunded: boolean }>;
  rollbackOnError(): Promise<void>;
}

export type ChargeChatBillingParams = {
  operationIdentity?: string;
  dbOk: boolean;
  profileUserId: string | null;
  session: SessionRow | null;
  unlimited: boolean;
  runeSettings: { enabled: boolean; freeQuestions?: number };
  freeLimit: number;
  imageBase64?: string;
  /** Stable caller event id for retry-safe bot/native chat turns. */
  idempotencyKey?: string;
  legacyIdempotencyKeys?: string[];
  /** Maximum rune amount explicitly confirmed by the caller. */
  maxCost?: number;
};

export type ChargeChatBillingResult =
  | { ok: true; handle: ChatBillingHandle; session: SessionRow | null }
  | { ok: false; response: NextResponse };

/**
 * Reserve question slot and charge runes when applicable.
 * Uses BillingService.chargeForSession for rune billing path.
 */
export async function chargeChatBilling(
  params: ChargeChatBillingParams
): Promise<ChargeChatBillingResult> {
  const {
    dbOk,
    profileUserId,
    session: initialSession,
    unlimited,
    runeSettings,
    freeLimit,
    imageBase64,
    idempotencyKey,
  } = params;

  let session = initialSession;
  let isPaid = false;

  if (session) {
    isPaid = hasPaidAccess(session, { unlimited });
  } else if (unlimited) {
    isPaid = true;
  }

  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);
  const needsSession = Boolean(
    dbOk && !unlimited && (useRuneBilling || (!runeSettings.enabled && !isPaid))
  );

  if (needsSession && !session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "session_required", message: "Обновите страницу — сессия не найдена" },
        { status: 400 }
      ),
    };
  }

  const sessionHasFullAccess = isPaid || unlimited;
  let questionIndex = session ? Math.max(0, session.free_questions_used) : 0;
  let runeBalance: number | undefined;
  let freeQuestionsRemaining: number | undefined;
  let charge: BillingChargeResult | undefined;
  let slotReserved = false;
  let sessionIdForRollback: string | undefined;

  if (session) {
    sessionIdForRollback = session.id;
  }

  const actionType: RuneActionType = imageBase64 ? "VISION_ANALYSIS" : "QUESTION";

  if (
    session &&
    !useRuneBilling &&
    actionType === "QUESTION" &&
    isSessionChatQuestionCapReached(session.free_questions_used)
  ) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "session_question_limit",
          message: SESSION_CHAT_LIMIT_MESSAGE,
          limit: SESSION_CHAT_QUESTION_LIMIT,
          used: session.free_questions_used,
        },
        { status: 403 }
      ),
    };
  }

  if (dbOk && session && useRuneBilling && profileUserId) {
    try {
      const settings = await getRuneSettings();
      const cost = runeCostFromSettings(settings, actionType);

      charge = await chargeForSession({
        userId: profileUserId,
        cost,
        actionType,
        sessionId: actionType === "QUESTION" ? session.id : undefined,
        freeQuestionLimit: freeLimit,
        hasFullAccess: sessionHasFullAccess,
        reserveFreeSlot: actionType === "QUESTION",
        // Per chat turn: session + action + current question counter (stable for double-submit).
        idempotencyKey:
          normalizeChargeIdempotencyKey(idempotencyKey) ??
          `chat:${session.id}:${actionType}:${session.free_questions_used}`,
        maxCost: params.maxCost,
        legacyIdempotencyKeys: params.legacyIdempotencyKeys,
        operationIdentity: params.operationIdentity,
      });

      questionIndex = charge.questionIndex ?? questionIndex;
      runeBalance = charge.newBalance;
      freeQuestionsRemaining = charge.freeQuestionsRemaining;
      slotReserved = charge.slotReserved;
      session = (await getSession(session.id)) ?? session;
    } catch (billingErr) {
      if (billingErr instanceof SessionQuestionLimitError) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: "session_question_limit",
              message: billingErr.message,
              limit: SESSION_CHAT_QUESTION_LIMIT,
            },
            { status: 403 }
          ),
        };
      }
      if (billingErr instanceof InsufficientFundsError) {
        return { ok: false, response: insufficientFundsResponse(billingErr) };
      }
      if (billingErr instanceof ConfirmedCostExceededError) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: "price_changed",
              message: "Стоимость вопроса изменилась. Подтвердите новую цену.",
              confirmed: billingErr.confirmed,
              required: billingErr.actual,
            },
            { status: 409 }
          ),
        };
      }
      if (billingErr instanceof BillingIdempotencyConflictError) {
        return { ok: false, response: billingIdempotencyConflictResponse() };
      }
      throw billingErr;
    }
  } else if (dbOk && session && !useRuneBilling && !sessionHasFullAccess) {
    if (isSessionChatQuestionCapReached(session.free_questions_used)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "session_question_limit",
            message: SESSION_CHAT_LIMIT_MESSAGE,
            limit: SESSION_CHAT_QUESTION_LIMIT,
            used: session.free_questions_used,
          },
          { status: 403 }
        ),
      };
    }
    const reserved = await reserveQuestionSlot(session.id, freeLimit, false);
    if (reserved === null) {
      return {
        ok: false,
        response: NextResponse.json({ error: "paywall", paywall: true }, { status: 402 }),
      };
    }
    slotReserved = true;
    questionIndex = reserved - 1;
    freeQuestionsRemaining = Math.max(0, freeLimit - reserved);
    session = (await getSession(session.id)) ?? session;
  } else if (dbOk && session && !useRuneBilling && sessionHasFullAccess) {
    if (isSessionChatQuestionCapReached(session.free_questions_used)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "session_question_limit",
            message: SESSION_CHAT_LIMIT_MESSAGE,
            limit: SESSION_CHAT_QUESTION_LIMIT,
            used: session.free_questions_used,
          },
          { status: 403 }
        ),
      };
    }
    await reserveQuestionSlot(session.id, freeLimit, true);
  }

  const handle: ChatBillingHandle = {
    questionIndex,
    runeBalance,
    freeQuestionsRemaining,
    sessionHasFullAccess,
    useRuneBilling,
    charge,
    async rollbackLlmFailure() {
      let runesRefunded = false;
      if (profileUserId && charge) {
        const pendingCharge = charge;
        charge = undefined;
        slotReserved = false;
        const rollback = await rollbackChargeEx({
          userId: profileUserId,
          cost: pendingCharge.spentRunes,
          wasFreeQuestion: pendingCharge.wasFreeQuestion,
          sessionId: sessionIdForRollback,
          slotReserved: pendingCharge.slotReserved,
          actionType: pendingCharge.actionType,
          transactionId: pendingCharge.transactionId,
        });
        runeBalance = rollback.balance;
        runesRefunded = rollback.refunded && pendingCharge.spentRunes > 0;
        charge = undefined;
      } else if (slotReserved && sessionIdForRollback && dbOk) {
        try {
          slotReserved = false;
          await decrementQuestionCount(sessionIdForRollback);
          slotReserved = false;
        } catch (rollbackErr) {
          console.error("LLM fallback slot rollback failed:", rollbackErr);
        }
      }
      return { runesRefunded };
    },
    async rollbackOnError() {
      if (profileUserId && charge) {
        const pendingCharge = charge;
        charge = undefined;
        slotReserved = false;
        const rollback = await rollbackChargeEx({
          userId: profileUserId,
          cost: pendingCharge.spentRunes,
          wasFreeQuestion: pendingCharge.wasFreeQuestion,
          sessionId: sessionIdForRollback,
          slotReserved: pendingCharge.slotReserved,
          actionType: pendingCharge.actionType,
          transactionId: pendingCharge.transactionId,
        });
        runeBalance = rollback.balance;
        charge = undefined;
      } else if (slotReserved && sessionIdForRollback) {
        try {
          slotReserved = false;
          await decrementQuestionCount(sessionIdForRollback);
        } catch {
          /* ignore */
        }
      }
    },
  };

  return { ok: true, handle, session };
}
