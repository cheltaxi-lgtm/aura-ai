import { queryClient, withTransaction, type PoolClient } from "@/lib/db";

type PaidOrder = {
  id: string; session_id: string; user_id: string | null; payment_type: "single" | "subscription";
  subscription_bonus_runes: number | null; influencer_id: string | null; amount: string;
  blogger_split_percent: number | null;
  alreadyCompleted?: boolean;
};
async function deliverOrder(client: PoolClient, order: PaidOrder) {
  const bonus = order.subscription_bonus_runes;
  if (order.payment_type === "subscription" && (!Number.isSafeInteger(bonus) || bonus == null || bonus < 0)) {
    throw new Error("subscription_bonus_snapshot_missing");
  }
  if (order.user_id) {
    const owner = await queryClient(client, "SELECT id FROM users WHERE id=$1 FOR UPDATE", [order.user_id]);
    if (!owner.rows[0]) throw new Error("payment_owner_not_found");
  }
  const session = await queryClient<{user_id:string|null}>(client,
    "SELECT user_id FROM sessions WHERE id=$1 FOR UPDATE", [order.session_id]);
  if (!session.rows[0] || session.rows[0].user_id !== order.user_id) throw new Error("payment_session_owner_changed");
  if (order.payment_type === "subscription") {
    if (bonus! > 0) {
      if (!order.user_id) throw new Error("payment_owner_not_found");
      const credit = await queryClient<{rune_balance:number}>(client,
        "UPDATE users SET rune_balance=rune_balance+$2 WHERE id=$1 RETURNING rune_balance", [order.user_id,bonus]);
      await queryClient(client,
        `INSERT INTO rune_transactions (user_id,type,amount,balance_after,description,payment_id)
         VALUES ($1,'bonus',$2,$3,'Подписка 30 дней — эквивалент рун',$4)`,
        [order.user_id,bonus,credit.rows[0].rune_balance,`sub-bonus:order:${order.id}`]);
    }
    await queryClient(client,
      `UPDATE sessions SET paid_until=GREATEST(COALESCE(paid_until,NOW()),NOW())+INTERVAL '30 days',
       has_single_unlock=TRUE,updated_at=NOW() WHERE id=$1`, [order.session_id]);
  } else {
    await queryClient(client,"UPDATE sessions SET has_single_unlock=TRUE,updated_at=NOW() WHERE id=$1",[order.session_id]);
  }
}

/** Payment transition, bonus ledger and access commit together; retries never extend twice. */
export async function fulfillLegacyPayment(
  selector: { providerId: string } | { orderId: string } | { sessionId:string; plan:"single"|"subscription"; operationId:string; orderId?:string },
  amount: number
): Promise<PaidOrder | null> {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return withTransaction(async client => {
    const where = "operationId" in selector
      ? "session_id=$1 AND payment_type=$3 AND yukassa_payment_id IS NULL AND (yoomoney_operation_id IS NULL OR yoomoney_operation_id=$4) AND ($5::text IS NULL OR order_id=$5)"
      : "providerId" in selector ? "yukassa_payment_id=$1" : "order_id=$1";
    const params = "operationId" in selector ? [selector.sessionId,amount,selector.plan,selector.operationId,selector.orderId??null]
      : "providerId" in selector ? [selector.providerId,amount] : [selector.orderId,amount];
    // Legacy YooMoney labels without order IDs must resolve unambiguously.
    const {rows} = await queryClient<PaidOrder>(client,
      `SELECT id,session_id,user_id,payment_type,subscription_bonus_runes,influencer_id,amount::text,blogger_split_percent
       FROM payments WHERE ${where} AND status='pending' AND ABS(amount-$2::numeric)<0.01 FOR UPDATE`,params);
    if (rows.length !== 1) {
      if (rows.length === 0 && "operationId" in selector) {
        const prior=await queryClient<PaidOrder>(client,
          `SELECT id,session_id,user_id,payment_type,subscription_bonus_runes,influencer_id,amount::text,blogger_split_percent
           FROM payments WHERE ${where} AND status='succeeded' AND yoomoney_operation_id=$4 AND ABS(amount-$2::numeric)<0.01`,params);
        if(prior.rows.length===1)return {...prior.rows[0],alreadyCompleted:true};
      }
      return null;
    }
    const order=rows[0];
    if ("operationId" in selector) {
      await queryClient(client,"UPDATE payments SET yoomoney_operation_id=$2 WHERE id=$1",[order.id,selector.operationId]);
    }
    await deliverOrder(client,order);
    await queryClient(client,"UPDATE payments SET status='succeeded',updated_at=NOW() WHERE id=$1",[order.id]);
    await queryClient(client,"UPDATE history SET is_paid=TRUE WHERE user_id=$1",[order.user_id]);
    return order;
  });
}
