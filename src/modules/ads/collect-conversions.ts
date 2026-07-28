import { adsReadOnlyPublic } from "./db";
import { recordServerConversion } from "./attribution";

/**
 * Read-only collectors from product tables → ads.conversion.
 * Never mutates public schema.
 */
export async function collectServerConversions(sinceDays = 7): Promise<{
  registration: number;
  claim: number;
  first_payment: number;
  repeat_payment: number;
  first_rune_spend: number;
  spread_submit: number;
}> {
  const counts = {
    registration: 0,
    claim: 0,
    first_payment: 0,
    repeat_payment: 0,
    first_rune_spend: 0,
    spread_submit: 0,
  };

  // Registrations (user_accounts)
  const regs = await adsReadOnlyPublic<{ id: string; created_at: Date }>(
    `SELECT id, created_at FROM user_accounts
     WHERE created_at >= NOW() - ($1::text || ' days')::interval
     ORDER BY created_at ASC
     LIMIT 5000`,
    [String(sinceDays)]
  );
  for (const r of regs.rows) {
    const res = await recordServerConversion({
      userId: r.id,
      type: "registration",
      occurredAt: new Date(r.created_at),
    });
    if (res === "ok") counts.registration++;
  }

  // Claims
  const claims = await adsReadOnlyPublic<{
    user_id: string;
    guest_resume_claimed_at: Date;
  }>(
    `SELECT user_id::text AS user_id, guest_resume_claimed_at
     FROM sessions
     WHERE guest_resume_status = 'claimed'
       AND guest_resume_claimed_at IS NOT NULL
       AND guest_resume_claimed_at >= NOW() - ($1::text || ' days')::interval
       AND user_id IS NOT NULL
     LIMIT 5000`,
    [String(sinceDays)]
  );
  for (const c of claims.rows) {
    // Map profile user_id → account id if needed
    const acc = await adsReadOnlyPublic<{ id: string }>(
      `SELECT id FROM user_accounts WHERE profile_user_id = $1::uuid OR id = $1::uuid LIMIT 1`,
      [c.user_id]
    );
    const userId = acc.rows[0]?.id;
    if (!userId) continue;
    const res = await recordServerConversion({
      userId,
      type: "claim",
      occurredAt: new Date(c.guest_resume_claimed_at),
    });
    if (res === "ok") counts.claim++;
  }

  // Rune purchases → first_payment / repeat_payment / first_rune_spend
  const purchases = await adsReadOnlyPublic<{
    user_id: string;
    created_at: Date;
    amount: number;
    payment_id: string | null;
  }>(
    `SELECT rt.user_id::text AS user_id, rt.created_at, rt.amount, rt.payment_id
     FROM rune_transactions rt
     WHERE rt.type = 'purchase'
       AND rt.payment_id IS NOT NULL
       AND rt.created_at >= NOW() - ($1::text || ' days')::interval
     ORDER BY rt.created_at ASC
     LIMIT 5000`,
    [String(sinceDays)]
  );

  const seenFirst = new Set<string>();
  for (const p of purchases.rows) {
    const acc = await adsReadOnlyPublic<{ id: string }>(
      `SELECT id FROM user_accounts WHERE profile_user_id = $1::uuid OR id = $1::uuid LIMIT 1`,
      [p.user_id]
    );
    const userId = acc.rows[0]?.id;
    if (!userId) continue;

    // Approximate RUB from package if amount is rune count — prefer description join later
    const amountRub = null;

    if (!seenFirst.has(userId)) {
      seenFirst.add(userId);
      const a = await recordServerConversion({
        userId,
        type: "first_payment",
        amountRub,
        occurredAt: new Date(p.created_at),
      });
      if (a === "ok") counts.first_payment++;
      const b = await recordServerConversion({
        userId,
        type: "first_rune_spend",
        amountRub,
        occurredAt: new Date(p.created_at),
      });
      if (b === "ok") counts.first_rune_spend++;
    } else {
      const r = await recordServerConversion({
        userId,
        type: "repeat_payment",
        amountRub,
        occurredAt: new Date(p.created_at),
      });
      if (r === "ok") counts.repeat_payment++;
    }
  }

  // Server-side spread_submit from sessions with guest resume issued/claimed
  const spreads = await adsReadOnlyPublic<{
    user_id: string | null;
    created_at: Date;
    id: string;
  }>(
    `SELECT user_id::text AS user_id, created_at, id::text AS id
     FROM sessions
     WHERE guest_resume_token_hash IS NOT NULL
       AND created_at >= NOW() - ($1::text || ' days')::interval
     LIMIT 5000`,
    [String(sinceDays)]
  );
  // Prefer existing beacon/micro spread_submit; only backfill when user linked and none today
  for (const s of spreads.rows) {
    if (!s.user_id) continue;
    const acc = await adsReadOnlyPublic<{ id: string }>(
      `SELECT id FROM user_accounts WHERE profile_user_id = $1::uuid OR id = $1::uuid LIMIT 1`,
      [s.user_id]
    );
    const userId = acc.rows[0]?.id;
    if (!userId) continue;
    const { adsQuery } = await import("./db");
    const existing = await adsQuery(
      `SELECT 1 FROM ads.conversion
       WHERE user_id = $1::uuid AND type = 'spread_submit'
         AND occurred_at::date = $2::date LIMIT 1`,
      [userId, new Date(s.created_at).toISOString().slice(0, 10)]
    );
    if (existing.rows.length) continue;
    const res = await recordServerConversion({
      userId,
      type: "spread_submit",
      occurredAt: new Date(s.created_at),
    });
    if (res === "ok") counts.spread_submit++;
  }

  return counts;
}
