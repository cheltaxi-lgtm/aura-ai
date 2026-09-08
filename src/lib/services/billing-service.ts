import { NextResponse } from "next/server";
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
};

/**
 * Double-submit window for server-derived charge keys when the caller omits an
 * explicit Idempotency-Key. Distinct intentional charges inside this window must
 * pass distinct keys (or wait for the next bucket).
 */
export const CHARGE_IDEM_WINDOW_SEC = 30;

const IDEM_KEY_MAX = 128;
const IDEM_KEY_RE = /^[A-Za-z0-9_.:\-]+$/;

/** Validate / normalize a caller key. Invalid → null (treated as absent) + warning. */
export function normalizeChargeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > IDEM_KEY_MAX || !IDEM_KEY_RE.test(trimmed)) {
    console.warn("[billing] invalid idempotencyKey ignored", {
      length: trimmed.length,
      preview: trimmed.slice(0, 24),
    });
    return null;
  }
  return trimmed;
}

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
  userId: string
): Promise<number> {
  const { rows } = await queryClient<{ rune_balance: number }>(
    client,
    `SELECT rune_balance FROM users WHERE id = $1 FOR UPDATE`,
    [userId]
  );
  if (!rows[0]) throw new Error("user_not_found");
  return rows[0].rune_balance;
}

async function logFreeQuestionSpend(
  client: PoolClient,
  userId: string,
  balanceAfter: number,
  actionType: string,
  idempotencyKey: string | null
): Promise<string> {
  const {rows} = await queryClient<{id:string}>(
    client,
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type, idempotency_key)
     VALUES ($1, 'spend', 0, $2, $3, $4, $5) RETURNING id`,
    [userId, balanceAfter, "Списан бесплатный вопрос", actionType, idempotencyKey]
  );
  return rows[0].id;
}

async function findSpendByIdempotencyKey(
  client: PoolClient,
  userId: string,
  idempotencyKey: string
): Promise<{ id: string; amount: number; balance_after: number } | null> {
  const { rows } = await queryClient<{
    id: string;
    amount: number;
    balance_after: number;
  }>(
    client,
    `SELECT id, amount, balance_after FROM rune_transactions
     WHERE user_id = $1 AND idempotency_key = $2 AND type = 'spend'
     LIMIT 1`,
    [userId, idempotencyKey]
  );
  return rows[0] ?? null;
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
  idempotencyKey: string | null
): Promise<{ transactionId?: string; conflict: boolean }> {
  if (idempotencyKey) {
    const { rows } = await queryClient<{ id: string }>(
      client,
      `INSERT INTO rune_transactions
         (user_id, type, amount, balance_after, description, action_type, idempotency_key)
       VALUES ($1, 'spend', $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [userId, -amount, balanceAfter, description, actionType, idempotencyKey]
    );
    if (!rows[0]) return { conflict: true };
    return { transactionId: rows[0].id, conflict: false };
  }

  const { rows } = await queryClient<{ id: string }>(
    client,
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type)
     VALUES ($1, 'spend', $2, $3, $4, $5)
     RETURNING id`,
    [userId, -amount, balanceAfter, description, actionType]
  );
  return { transactionId: rows[0]?.id, conflict: false };
}

async function reserveQuestionIndex(
  client: PoolClient,
  sessionId: string,
  freeLimit: number,
  hasFullAccess: boolean
): Promise<{ questionIndex: number; freeQuestionsRemaining: number }> {
  await queryClient(client, `SELECT id FROM sessions WHERE id = $1 FOR UPDATE`, [sessionId]);

  const { rows: capRows } = await queryClient<{ free_questions_used: number }>(
    client,
    `SELECT free_questions_used FROM sessions WHERE id = $1`,
    [sessionId]
  );
  if (isSessionChatQuestionCapReached(capRows[0]?.free_questions_used)) {
    throw new SessionQuestionLimitError();
  }

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

  const idempotencyKey = resolveEffectiveChargeIdempotencyKey(params);
  const balance = await lockUserRow(client, userId);

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
    const prior = await findSpendByIdempotencyKey(client, userId, idempotencyKey);
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
      freeQuestionLimit,
      hasFullAccess
    );
    questionIndex = reserved.questionIndex;
    freeQuestionsRemaining = reserved.freeQuestionsRemaining;
    slotReserved = true;

    if (!hasFullAccess && questionIndex < freeQuestionLimit) {
      const transactionId=await logFreeQuestionSpend(client, userId, balance, actionType,idempotencyKey);
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
    idempotencyKey
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
        await withTransaction(async client=>{
          const balance=await lockUserRow(client,userId);
          const claim=await queryClient(client,`INSERT INTO rune_transactions(user_id,type,amount,balance_after,description,refund_of_transaction_id)
            SELECT $1,'refund',0,$2,'Возврат бесплатного вопроса',id FROM rune_transactions WHERE id=$3 AND user_id=$1 AND type='spend' AND amount=0
            ON CONFLICT(refund_of_transaction_id) WHERE type='refund' AND refund_of_transaction_id IS NOT NULL DO NOTHING RETURNING id`,[userId,balance,transactionId]);
          if(claim.rowCount)await queryClient(client,"UPDATE sessions SET free_questions_used=GREATEST(0,free_questions_used-1),updated_at=NOW() WHERE id=$1 AND user_id=$2",[sessionId,userId]);
        });
      }else await decrementQuestionCount(sessionId);
      refunded = true;
    } catch (err) {
      console.error("[BillingService] slot rollback failed:", err);
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
        slotReserved ? sessionId : undefined
      );
      return { balance, refunded: true };
    } catch (err) {
      console.error("[BillingService] rune rollback failed:", err);
      return { balance: await getRuneBalance(userId), refunded: false };
    }
  }

  return { balance: await getRuneBalance(userId), refunded };
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
}): Promise<BillingChargeResult> {
  const settings = await getRuneSettings();
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
  dbOk: boolean;
  profileUserId: string | null;
  session: SessionRow | null;
  unlimited: boolean;
  runeSettings: { enabled: boolean; freeQuestions?: number };
  freeLimit: number;
  imageBase64?: string;
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
        idempotencyKey: `chat:${session.id}:${actionType}:${session.free_questions_used}`,
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
