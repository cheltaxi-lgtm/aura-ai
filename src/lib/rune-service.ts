import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { RUNE_ACTION_LABELS, type RuneActionType } from "@/lib/rune-costs";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { runesFromRubAmount } from "@/lib/rune-purchase-constants";

export interface AffordCheck {
  allowed: boolean;
  balance: number;
  cost: number;
  reason?: string;
}

export async function getRuneBalance(userId: string): Promise<number> {
  const { rows } = await query<{ rune_balance: number }>(
    "SELECT rune_balance FROM users WHERE id = $1",
    [userId]
  );
  return rows[0]?.rune_balance ?? 0;
}

/** Rune billing applies for all priced actions when runes are enabled (ignores legacy paywall session). */
export function isRuneBillingActive(
  profileUserId: string | null | undefined,
  unlimited: boolean,
  runeSettings: { enabled: boolean }
): boolean {
  return Boolean(profileUserId && !unlimited && runeSettings.enabled);
}

async function isFreeQuestion(action: RuneActionType, questionIndex?: number): Promise<boolean> {
  if (action !== "QUESTION") return false;
  const settings = await getRuneSettings();
  return (questionIndex ?? 0) < settings.freeQuestions;
}

export async function canAfford(
  userId: string,
  action: RuneActionType,
  questionIndex?: number
): Promise<AffordCheck> {
  if (await isFreeQuestion(action, questionIndex)) {
    const balance = await getRuneBalance(userId);
    return { allowed: true, balance, cost: 0 };
  }

  const settings = await getRuneSettings();
  const balance = await getRuneBalance(userId);
  const cost = runeCostFromSettings(settings, action);

  if (balance < cost) {
    return {
      allowed: false,
      balance,
      cost,
      reason: `Недостаточно рун: нужно ${cost} ᚢ, у вас ${balance} ᚢ`,
    };
  }

  return { allowed: true, balance, cost };
}

/** Spend a custom rune amount (e.g. ritual costs vary by type). */
export async function spendRunesAmount(
  userId: string,
  amount: number,
  description: string,
  actionType = "ritual",
  client?: PoolClient
): Promise<{ success: boolean; balanceAfter: number; cost: number; error?: string }> {
  const run = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(client, text, params)
    : query;

  if (amount <= 0) {
    const balance = await getRuneBalance(userId);
    return { success: true, balanceAfter: balance, cost: 0 };
  }

  const { rows } = await run<{ new_balance: number; success: boolean }>(
    `WITH updated AS (
       UPDATE users
       SET rune_balance = rune_balance - $2
       WHERE id = $1 AND rune_balance >= $2
       RETURNING rune_balance AS new_balance
     )
     SELECT
       COALESCE((SELECT new_balance FROM updated), -1) AS new_balance,
       EXISTS (SELECT 1 FROM updated) AS success`,
    [userId, amount]
  );

  const { new_balance, success } = rows[0] ?? { new_balance: -1, success: false };

  if (!success) {
    const balance = await getRuneBalance(userId);
    return {
      success: false,
      balanceAfter: balance,
      cost: amount,
      error: `Недостаточно рун: нужно ${amount} ᚢ, у вас ${balance} ᚢ`,
    };
  }

  await run(
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type)
     VALUES ($1, 'spend', $2, $3, $4, $5)`,
    [userId, -amount, new_balance, description, actionType]
  );

  return { success: true, balanceAfter: new_balance, cost: amount };
}

export async function spendRunesAtomic(
  userId: string,
  action: RuneActionType,
  questionIndex?: number,
  client?: PoolClient
): Promise<{ success: boolean; balanceAfter: number; cost: number; error?: string }> {
  const run = client
    ? <T extends import("pg").QueryResultRow>(text: string, params?: unknown[]) =>
        queryClient(client, text, params)
    : query;

  if (await isFreeQuestion(action, questionIndex)) {
    const balance = await getRuneBalance(userId);
    return { success: true, balanceAfter: balance, cost: 0 };
  }

  const settings = await getRuneSettings();
  const cost = runeCostFromSettings(settings, action);

  const { rows } = await run<{ new_balance: number; success: boolean }>(
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

  const { new_balance, success } = rows[0] ?? { new_balance: -1, success: false };

  if (!success) {
    const balance = await getRuneBalance(userId);
    return {
      success: false,
      balanceAfter: balance,
      cost,
      error: `Недостаточно рун: нужно ${cost} ᚢ, у вас ${balance} ᚢ`,
    };
  }

  await run(
    `INSERT INTO rune_transactions
       (user_id, type, amount, balance_after, description, action_type)
     VALUES ($1, 'spend', $2, $3, $4, $5)`,
    [userId, -cost, new_balance, RUNE_ACTION_LABELS[action], action]
  );

  return { success: true, balanceAfter: new_balance, cost };
}

export async function spendRunes(
  userId: string,
  action: RuneActionType,
  questionIndex?: number,
  client?: PoolClient
): Promise<{ success: boolean; newBalance: number; error?: string; cost?: number }> {
  const result = await spendRunesAtomic(userId, action, questionIndex, client);
  return {
    success: result.success,
    newBalance: result.balanceAfter,
    error: result.error,
    cost: result.cost,
  };
}

/** Refund runes after failed LLM / server error (not for fallback replies). */
export async function refundRunes(
  userId: string,
  amount: number,
  description: string,
  action?: RuneActionType,
  originalTransactionId?: string
): Promise<number> {
  if (amount <= 0) {
    return getRuneBalance(userId);
  }

  return withTransaction(async (client) => {
    const { rows: lockedUsers } = await queryClient<{ rune_balance: number }>(
      client,
      `SELECT rune_balance FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const currentBalance = lockedUsers[0]?.rune_balance;
    if (currentBalance == null) throw new Error("user_not_found");

    let refundTransactionId: string | undefined;
    if (originalTransactionId) {
      const { rows: claimed } = await queryClient<{ id: string }>(
        client,
        `INSERT INTO rune_transactions (
           user_id, type, amount, balance_after, description, action_type,
           refund_of_transaction_id
         )
         SELECT $1, 'refund', 0, $2, $3, $4, source.id
         FROM rune_transactions source
         WHERE source.id = $5
           AND source.user_id = $1
           AND source.type = 'spend'
         ON CONFLICT (refund_of_transaction_id)
           WHERE type = 'refund' AND refund_of_transaction_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [userId, currentBalance, description, action ?? null, originalTransactionId]
      );
      refundTransactionId = claimed[0]?.id;
      if (!refundTransactionId) {
        const { rows: existing } = await queryClient<{ id: string }>(
          client,
          `SELECT id
           FROM rune_transactions
           WHERE user_id = $1
             AND type = 'refund'
             AND refund_of_transaction_id = $2`,
          [userId, originalTransactionId]
        );
        if (existing[0]) return currentBalance;
        throw new Error("refund_source_transaction_not_found");
      }
    }

    const { rows } = await queryClient<{ new_balance: number }>(
      client,
      `UPDATE users
       SET rune_balance = rune_balance + $2
       WHERE id = $1
       RETURNING rune_balance AS new_balance`,
      [userId, amount]
    );
    const newBalance = rows[0]!.new_balance;

    if (refundTransactionId) {
      await queryClient(
        client,
        `UPDATE rune_transactions
         SET amount = $2, balance_after = $3
         WHERE id = $1`,
        [refundTransactionId, amount, newBalance]
      );
    } else {
      await queryClient(
        client,
        `INSERT INTO rune_transactions
           (user_id, type, amount, balance_after, description, action_type)
         VALUES ($1, 'refund', $2, $3, $4, $5)`,
        [userId, amount, newBalance, description, action ?? null]
      );
    }

    return newBalance;
  });
}

export async function addRunes(
  userId: string,
  amount: number,
  type: "purchase" | "bonus" | "refund" | "achievement" | "daily_bonus",
  description: string,
  paymentId?: string
): Promise<number> {
  const purchaseDelta = type === "purchase" ? amount : 0;

  return withTransaction(async (client) => {
    const { rows } = await queryClient<{ new_balance: number }>(
      client,
      `UPDATE users
       SET
         rune_balance = rune_balance + $2,
         total_runes_purchased = total_runes_purchased + $3
       WHERE id = $1
       RETURNING rune_balance AS new_balance`,
      [userId, amount, purchaseDelta]
    );

    const newBalance = rows[0]?.new_balance ?? 0;

    await queryClient(
      client,
      `INSERT INTO rune_transactions
         (user_id, type, amount, balance_after, description, payment_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, amount, newBalance, description, paymentId ?? null]
    );

    return newBalance;
  });
}

export async function getRuneTransactions(userId: string, limit = 50) {
  const { rows } = await query<{
    id: string;
    type: string;
    amount: number;
    balance_after: number;
    description: string;
    action_type: string | null;
    created_at: Date;
  }>(
    `SELECT id, type, amount, balance_after, description, action_type, created_at
     FROM rune_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

/** Credit runes to user (subscription equivalent, admin grant, etc.) */
export async function creditRunesToUser(
  userId: string,
  amount: number,
  type: "purchase" | "bonus" | "achievement" | "daily_bonus",
  description: string,
  paymentId?: string
): Promise<number> {
  if (paymentId && type === "bonus") {
    try {
      return await withTransaction(async (client) => {
        const { rows: claimed } = await queryClient<{ id: string }>(
          client,
          `INSERT INTO rune_transactions
             (user_id, type, amount, balance_after, description, payment_id)
           VALUES ($1, 'bonus', 0, 0, $3, $2)
           ON CONFLICT (payment_id) WHERE type = 'bonus' AND payment_id IS NOT NULL
           DO NOTHING
           RETURNING id`,
          [userId, paymentId, description]
        );
        if (!claimed[0]) {
          const { rows: bal } = await queryClient<{ rune_balance: number }>(
            client,
            `SELECT rune_balance FROM users WHERE id = $1`,
            [userId]
          );
          return bal[0]?.rune_balance ?? 0;
        }
        const { rows: updated } = await queryClient<{ rune_balance: number }>(
          client,
          `UPDATE users SET rune_balance = rune_balance + $2 WHERE id = $1
           RETURNING rune_balance`,
          [userId, amount]
        );
        const newBalance = updated[0]?.rune_balance ?? 0;
        await queryClient(
          client,
          `UPDATE rune_transactions SET amount = $2, balance_after = $3 WHERE id = $1`,
          [claimed[0].id, amount, newBalance]
        );
        return newBalance;
      });
    } catch (err) {
      // Never fall back to non-idempotent addRunes — that can double-credit.
      console.error("creditRunesToUser bonus claim failed:", err);
      const { rows: bal } = await query<{ rune_balance: number }>(
        `SELECT rune_balance FROM users WHERE id = $1`,
        [userId]
      );
      return bal[0]?.rune_balance ?? 0;
    }
  }
  return addRunes(userId, amount, type, description, paymentId);
}

export type RuneReceiptTransaction = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  action_type: string | null;
  created_at: Date;
};

export async function getUnshownReceipts(userId: string): Promise<RuneReceiptTransaction[]> {
  try {
    const { rows } = await query<RuneReceiptTransaction>(
      `SELECT id, type, amount, balance_after, description, action_type, created_at
       FROM rune_transactions
       WHERE user_id = $1
         AND shown_receipt = FALSE
         AND type IN ('purchase', 'achievement', 'daily_bonus', 'bonus')
         AND amount > 0
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );
    return rows;
  } catch {
    return [];
  }
}

export async function markReceiptsShown(userId: string, ids?: string[]): Promise<void> {
  if (ids?.length) {
    await query(
      `UPDATE rune_transactions
       SET shown_receipt = TRUE
       WHERE user_id = $1 AND id = ANY($2::uuid[])`,
      [userId, ids]
    );
    return;
  }
  await query(
    `UPDATE rune_transactions
     SET shown_receipt = TRUE
     WHERE user_id = $1
       AND shown_receipt = FALSE
       AND type IN ('purchase', 'achievement', 'daily_bonus', 'bonus')
       AND amount > 0`,
    [userId]
  );
}

/** Admin manual grant with audit trail */
export async function adminGrantRunes(
  userId: string,
  amount: number,
  reason: string,
  adminId: string
): Promise<number> {
  if (amount <= 0) throw new Error("amount_must_be_positive");

  return withTransaction(async (client) => {
    const { rows: updated } = await queryClient<{ rune_balance: number }>(
      client,
      `UPDATE users
       SET rune_balance = rune_balance + $2
       WHERE id = $1
       RETURNING rune_balance`,
      [userId, amount]
    );
    if (!updated[0]) throw new Error("user_not_found");

    const description = `Admin: ${reason}`;
    await queryClient(
      client,
      `INSERT INTO rune_transactions
         (user_id, type, amount, balance_after, description)
       VALUES ($1, 'bonus', $2, $3, $4)`,
      [userId, amount, updated[0].rune_balance, description]
    );

    await queryClient(
      client,
      `INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details)
       VALUES ($1, 'grant_runes', 'user', $2, $3)`,
      [adminId, userId, JSON.stringify({ amount, reason })]
    );

    return updated[0].rune_balance;
  });
}

export type CreditRunesResult = "credited" | "duplicate" | "rejected";

/** Idempotent credit after YooKassa payment.succeeded — package totals from DB; custom from paid amount. */
export async function creditRunesFromPayment(payment: {
  userId: string;
  packageId: string;
  paymentId: string;
  amountRub?: number;
  /** Snapshot price from payment metadata at create time (survives admin price edits). */
  expectedPriceRub?: number;
}): Promise<boolean> {
  const result = await creditRunesFromPaymentDetailed(payment);
  return result === "credited";
}

export async function creditRunesFromPaymentDetailed(payment: {
  userId: string;
  packageId: string;
  paymentId: string;
  amountRub?: number;
  expectedPriceRub?: number;
}): Promise<CreditRunesResult> {
  if (!payment.userId || !payment.packageId || !payment.paymentId) {
    return "rejected";
  }

  let amount: number;
  let description: string;

  if (payment.packageId === "custom") {
    if (!payment.amountRub || payment.amountRub <= 0) {
      console.warn("creditRunesFromPayment: custom payment missing amountRub");
      return "rejected";
    }
    const settings = await getRuneSettings();
    amount = runesFromRubAmount(payment.amountRub, settings.rubPerRune);
    if (amount <= 0) {
      console.warn("creditRunesFromPayment: custom payment yields zero runes");
      return "rejected";
    }
    description = `Пополнение на ${Math.round(payment.amountRub)} ₽: ${amount} ᚢ`;
  } else {
    const { rows: pkgRows } = await query<{
      name: string;
      runes: number;
      bonus_runes: number;
      price_rub: number;
    }>(
      `SELECT name, runes, bonus_runes, price_rub FROM rune_packages WHERE id = $1`,
      [payment.packageId]
    );
    const pkg = pkgRows[0];
    if (!pkg) {
      console.warn("creditRunesFromPayment: package not found:", payment.packageId);
      return "rejected";
    }

    if (payment.amountRub === undefined || !Number.isFinite(payment.amountRub)) {
      console.warn("creditRunesFromPayment: amountRub required", payment.paymentId);
      return "rejected";
    }
    const expected =
      payment.expectedPriceRub !== undefined && Number.isFinite(payment.expectedPriceRub)
        ? Number(payment.expectedPriceRub)
        : Number(pkg.price_rub);
    if (Math.abs(payment.amountRub - expected) > 0.01) {
      console.warn(
        "creditRunesFromPayment: amount mismatch",
        payment.paymentId,
        payment.amountRub,
        expected
      );
      return "rejected";
    }

    amount = pkg.runes + pkg.bonus_runes;
    if (amount <= 0) {
      console.warn("creditRunesFromPayment: invalid package rune total:", payment.packageId);
      return "rejected";
    }

    description = `Пакет рун «${pkg.name}»: ${amount} ᚢ`;
  }

  try {
    return await withTransaction(async (client) => {
      const { rows: claimed } = await queryClient<{ id: string }>(
        client,
        `INSERT INTO rune_transactions
           (user_id, type, amount, balance_after, description, payment_id)
         VALUES ($1, 'purchase', 0, 0, $3, $2)
         ON CONFLICT (payment_id) WHERE type = 'purchase' AND payment_id IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [payment.userId, payment.paymentId, description]
      );
      if (!claimed[0]) return "duplicate";

      const { rows: updated } = await queryClient<{ rune_balance: number }>(
        client,
        `UPDATE users
         SET
           rune_balance = rune_balance + $2,
           total_runes_purchased = total_runes_purchased + $2
         WHERE id = $1
         RETURNING rune_balance`,
        [payment.userId, amount]
      );
      if (!updated[0]) {
        throw new Error("user_not_found");
      }

      await queryClient(
        client,
        `UPDATE rune_transactions
         SET amount = $2, balance_after = $3
         WHERE id = $1`,
        [claimed[0].id, amount, updated[0].rune_balance]
      );

      return "credited";
    });
  } catch (err) {
    console.error("creditRunesFromPayment failed:", err);
    return "rejected";
  }
}

/** Restore starter flag from ledger without crediting runes again. */
export async function ensureStarterGrantMarker(
  userId: string,
  client?: PoolClient
): Promise<void> {
  if (client) {
    const { rows: prior } = await queryClient<{ id: string }>(
      client,
      `SELECT id FROM rune_transactions
       WHERE user_id = $1 AND description LIKE 'Стартовый пакет%'
       LIMIT 1`,
      [userId]
    );
    if (!prior[0]) return;
    await queryClient(
      client,
      `UPDATE users SET starter_runes_granted = TRUE
       WHERE id = $1 AND starter_runes_granted = FALSE`,
      [userId]
    );
    return;
  }

  const { rows: prior } = await query<{ id: string }>(
    `SELECT id FROM rune_transactions
     WHERE user_id = $1 AND description LIKE 'Стартовый пакет%'
     LIMIT 1`,
    [userId]
  );
  if (!prior[0]) return;

  await query(
    `UPDATE users SET starter_runes_granted = TRUE
     WHERE id = $1 AND starter_runes_granted = FALSE`,
    [userId]
  );
}

/** Одноразовый стартовый бонус при создании профиля */
export async function grantStarterRunesIfNeeded(
  userId: string
): Promise<{ granted: number; balance: number } | null> {
  const settings = await getRuneSettings();
  if (settings.starterRunes <= 0) return null;

  try {
    return await withTransaction(async (client) => {
      await queryClient(client, `SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

      const { rows: priorStarter } = await queryClient<{ id: string }>(
        client,
        `SELECT id FROM rune_transactions
         WHERE user_id = $1 AND description LIKE 'Стартовый пакет%'
         LIMIT 1`,
        [userId]
      );
      if (priorStarter[0]) {
        await queryClient(
          client,
          `UPDATE users SET starter_runes_granted = TRUE
           WHERE id = $1 AND starter_runes_granted = FALSE`,
          [userId]
        );
        return null;
      }

      const { rows: flagged } = await queryClient<{ rune_balance: number }>(
        client,
        `UPDATE users
         SET
           starter_runes_granted = TRUE,
           rune_balance = rune_balance + $2
         WHERE id = $1 AND starter_runes_granted = FALSE
         RETURNING rune_balance`,
        [userId, settings.starterRunes]
      );
      if (!flagged[0]) return null;

      const description = `Стартовый пакет: ${settings.starterRunes} ᚢ`;
      await queryClient(
        client,
        `INSERT INTO rune_transactions
           (user_id, type, amount, balance_after, description)
         VALUES ($1, 'bonus', $2, $3, $4)`,
        [userId, settings.starterRunes, flagged[0].rune_balance, description]
      );

      return { granted: settings.starterRunes, balance: flagged[0].rune_balance };
    });
  } catch (err) {
    console.error("grantStarterRunesIfNeeded failed:", err);
    return null;
  }
}
