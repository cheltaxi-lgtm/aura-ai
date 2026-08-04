import { NextResponse } from "next/server";

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
};

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
  actionType: string
): Promise<void> {
  await queryClient(
    client,
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type)
     VALUES ($1, 'spend', 0, $2, $3, $4)`,
    [userId, balanceAfter, "Списан бесплатный вопрос", actionType]
  );
}

async function logRuneSpend(
  client: PoolClient,
  userId: string,
  amount: number,
  balanceAfter: number,
  description: string,
  actionType: string
): Promise<string | undefined> {
  const { rows } = await queryClient<{ id: string }>(
    client,
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type)
     VALUES ($1, 'spend', $2, $3, $4, $5)
     RETURNING id`,
    [userId, -amount, balanceAfter, description, actionType]
  );
  return rows[0]?.id;
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
      await logFreeQuestionSpend(client, userId, balance, actionType);
      return {
        spentRunes: 0,
        wasFreeQuestion: true,
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
    throw new InsufficientFundsError(balance, cost);
  }

  const newBalance = rows[0]!.new_balance;
  const label =
    description ??
    (actionType in RUNE_ACTION_LABELS
      ? RUNE_ACTION_LABELS[actionType as RuneActionType]
      : actionType);

  const transactionId = await logRuneSpend(client, userId, cost, newBalance, label, actionType);

  return {
    spentRunes: cost,
    wasFreeQuestion: false,
    newBalance,
    actionType,
    sessionId,
    slotReserved,
    questionIndex,
    freeQuestionsRemaining,
    transactionId,
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

  if (slotReserved && sessionId) {
    try {
      await decrementQuestionCount(sessionId);
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
        transactionId
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
        const newBal = await rollbackCharge({
          userId: profileUserId,
          cost: charge.spentRunes,
          wasFreeQuestion: charge.wasFreeQuestion,
          sessionId: sessionIdForRollback,
          slotReserved: charge.slotReserved,
          actionType: charge.actionType,
        });
        runeBalance = newBal;
        runesRefunded = charge.spentRunes > 0;
        charge = undefined;
      } else if (slotReserved && sessionIdForRollback && dbOk) {
        try {
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
        const newBal = await rollbackCharge({
          userId: profileUserId,
          cost: charge.spentRunes,
          wasFreeQuestion: charge.wasFreeQuestion,
          sessionId: sessionIdForRollback,
          slotReserved: charge.slotReserved,
          actionType: charge.actionType,
        });
        runeBalance = newBal;
        charge = undefined;
      } else if (slotReserved && sessionIdForRollback) {
        try {
          await decrementQuestionCount(sessionIdForRollback);
        } catch {
          /* ignore */
        }
      }
    },
  };

  return { ok: true, handle, session };
}
