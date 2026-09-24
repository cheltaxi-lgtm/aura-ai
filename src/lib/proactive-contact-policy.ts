import { query, queryClient, withTransaction } from "@/lib/db";

export const PROACTIVE_CONTACT_MAX_24H = 1;
export const PROACTIVE_CONTACT_MAX_7D = 2;
export const PROACTIVE_RESERVATION_TIMEOUT_MINUTES = 30;
const RECURRING_REQUESTED_CAMPAIGNS = new Set(["daily_cards", "daily_bonus"]);

export type ProactiveReservation = { id: string };

/** Atomically reserve one logical contact across in-app, email, and Telegram. */
export async function reserveProactiveContact(
  userId: string,
  campaign: string,
  contactKey: string
): Promise<ProactiveReservation | null> {
  return withTransaction(async (client) => {
    await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [
      `proactive-contact:${userId}`,
    ]);
    await queryClient(
      client,
      `UPDATE proactive_contact_log
          SET status='failed'
        WHERE user_id=$1 AND status='reserved'
          AND created_at < NOW() - ($2::int || ' minutes')::interval`,
      [userId, PROACTIVE_RESERVATION_TIMEOUT_MINUTES]
    );
    const existing = await queryClient<{ id: string; status: string }>(
      client,
      `SELECT id,status FROM proactive_contact_log WHERE user_id=$1 AND contact_key=$2 LIMIT 1`,
      [userId, contactKey]
    );
    if (existing.rows[0] && existing.rows[0].status !== "failed") return null;
    const counts = await queryClient<{ day_count: number; msk_day_count: number; week_count: number }>(
      client,
      `SELECT
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS day_count,
         COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Europe/Moscow')::date =
           (NOW() AT TIME ZONE 'Europe/Moscow')::date)::int AS msk_day_count,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS week_count
       FROM proactive_contact_log
       WHERE user_id=$1 AND status IN ('reserved','delivered')`,
      [userId]
    );
    const row = counts.rows[0];
    const recurringRequested = RECURRING_REQUESTED_CAMPAIGNS.has(campaign);
    // Daily service messages use the product calendar day. A rolling 24-hour
    // window would skip tomorrow's reminder after even a small cron delay.
    if (recurringRequested
      ? (row?.msk_day_count ?? 0) >= PROACTIVE_CONTACT_MAX_24H
      : (row?.day_count ?? 0) >= PROACTIVE_CONTACT_MAX_24H) return null;
    // A user who explicitly requested a daily service reminder must not stop
    // receiving it after the second day. The Moscow-day cap still prevents
    // two proactive messages on the same day; win-back remains capped weekly.
    if (!recurringRequested &&
        (row?.week_count ?? 0) >= PROACTIVE_CONTACT_MAX_7D) return null;
    const inserted = await queryClient<{ id: string }>(
      client,
      `INSERT INTO proactive_contact_log(user_id,campaign,contact_key)
       VALUES($1,$2,$3)
       ON CONFLICT(user_id,contact_key) DO UPDATE SET
         campaign=EXCLUDED.campaign,status='reserved',created_at=NOW(),delivered_at=NULL
       WHERE proactive_contact_log.status='failed'
       RETURNING id`,
      [userId, campaign, contactKey]
    );
    return inserted.rows[0] ?? null;
  });
}

export async function finishProactiveContact(id: string, delivered: boolean): Promise<void> {
  await query(
    `UPDATE proactive_contact_log
        SET status=$2, delivered_at=CASE WHEN $2='delivered' THEN NOW() ELSE NULL END
      WHERE id=$1 AND status='reserved'`,
    [id, delivered ? "delivered" : "failed"]
  );
}
