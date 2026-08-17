import { query } from "@/lib/db";
import { pickDeliverableEmail } from "@/lib/email/mail-config";

/** Account mailbox, else Yandex / VK / other OAuth provider_email. */
export const ACCOUNT_DELIVERABLE_EMAIL_SQL = `
COALESCE(
  CASE
    WHEN ua.email IS NOT NULL
     AND ua.email NOT ILIKE '%@oauth.zovus.local'
     AND ua.email NOT ILIKE '%@telegram.zovus.local'
    THEN ua.email
  END,
  (
    SELECT oi.provider_email
    FROM user_oauth_identities oi
    WHERE oi.user_account_id = ua.id
      AND oi.provider_email IS NOT NULL
      AND oi.provider_email NOT ILIKE '%@oauth.zovus.local'
      AND oi.provider_email NOT ILIKE '%@telegram.zovus.local'
      AND position('@' in oi.provider_email) > 1
    ORDER BY CASE oi.provider WHEN 'yandex' THEN 0 WHEN 'vk' THEN 1 ELSE 2 END,
             oi.updated_at DESC NULLS LAST
    LIMIT 1
  )
)
`;

export function resolveRowDeliverableEmail(
  accountEmail: string | null | undefined,
  providerEmail: string | null | undefined
): string | null {
  return pickDeliverableEmail(accountEmail, providerEmail);
}

/** Deliverable mailbox for one account: real account email, else Yandex/VK OAuth email. */
export async function getAccountDeliverableEmail(accountId: string): Promise<string | null> {
  const { rows } = await query<{ deliverable_email: string | null }>(
    `SELECT (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS deliverable_email
     FROM user_accounts ua WHERE ua.id = $1 LIMIT 1`,
    [accountId]
  );
  return pickDeliverableEmail(rows[0]?.deliverable_email);
}
