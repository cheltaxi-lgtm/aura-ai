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
