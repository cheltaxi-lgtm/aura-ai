import { query, queryClient, type PoolClient } from "@/lib/db";

export type ProductActivityEvent =
  | "request_started"
  | "result_viewed"
  | "result_reopened"
  | "chat_message_sent"
  | "diary_saved"
  | "feedback_sent";

const REPEATABLE_ACTIVITY_EVENTS = new Set<ProductActivityEvent>([
  "result_viewed",
  "result_reopened",
  "diary_saved",
  "feedback_sent",
]);

/** Privacy-safe product activity. Never pass questions, answers, or diary text. */
export async function recordProductActivity(
  userId: string,
  event: ProductActivityEvent,
  key: string,
  metadata: { product?: string } = {},
  client?: PoolClient
): Promise<void> {
  const run = client ? queryClient.bind(null, client) : query;
  await run(
    `WITH touched_user AS (
       UPDATE users
          SET last_product_activity_at = GREATEST(
            COALESCE(last_product_activity_at, '-infinity'::timestamptz),
            NOW()
          )
        WHERE id = $1
        RETURNING id
     ), registration AS (
       SELECT MIN(created_at) AS registered_at
       FROM user_accounts
       WHERE profile_user_id = $1
     )
     INSERT INTO spread_metrics(user_id,event,spread_id,source,idempotency_key,metadata)
     SELECT touched_user.id,$2,'retention','product_activity',
            CASE WHEN $5::boolean THEN
              $3 || ':rday:' || (
                CASE WHEN registration.registered_at IS NULL THEN
                  FLOOR(EXTRACT(EPOCH FROM NOW()) / 86400)
                ELSE GREATEST(
                  0,
                  FLOOR(EXTRACT(EPOCH FROM (NOW() - registration.registered_at)) / 86400)
                ) END
              )::bigint::text
            ELSE $3 END,
            $4::jsonb
       FROM touched_user
       CROSS JOIN registration
     ON CONFLICT(user_id,event,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [userId, event, key, JSON.stringify(metadata), REPEATABLE_ACTIVITY_EVENTS.has(event)]
  );
}
