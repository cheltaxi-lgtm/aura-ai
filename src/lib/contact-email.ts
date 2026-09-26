import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { query, queryClient, withTransaction } from "@/lib/db";
import { getSiteUrl, isDeliverableUserEmail } from "@/lib/email/mail-config";
import { sendEmail } from "@/lib/email/send";
import { getAccountDeliverableEmail } from "@/lib/reminder-contacts";
import { getAccountDailyCardsReminder, getProfileUserIdForAccount } from "@/lib/accounts";
import { getNotificationPrefs } from "@/lib/daily-reminder-service";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";

function signingKey(): Uint8Array {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET_required");
  return createHmac("sha256", process.env.AUTH_SECRET)
    .update("zovus:contact-email:v1")
    .digest();
}

export function normalizeContactEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return isDeliverableUserEmail(email) ? email : null;
}

export async function getContactEmailStatus(accountId: string): Promise<{
  hasEmail: boolean;
  hasContactEmail: boolean;
  masterReminder: boolean;
  dailyCardsReminder: boolean;
}> {
  const [email, dailyCardsReminder, profileUserId, contact] = await Promise.all([
    getAccountDeliverableEmail(accountId),
    getAccountDailyCardsReminder(accountId),
    getProfileUserIdForAccount(accountId),
    query<{ has_contact_email: boolean }>(
      `SELECT contact_email IS NOT NULL AND contact_email_verified_at IS NOT NULL
         AS has_contact_email FROM user_accounts WHERE id=$1`, [accountId]),
  ]);
  const dailyEmail = profileUserId
    ? (await getNotificationPrefs(profileUserId)).dailyEmail
    : false;
  return {
    hasEmail: Boolean(email),
    hasContactEmail: contact.rows[0]?.has_contact_email === true,
    masterReminder: dailyCardsReminder,
    dailyCardsReminder: Boolean(email) && dailyCardsReminder && dailyEmail,
  };
}

export async function requestContactEmailVerification(input: {
  accountId: string;
  email: string;
  dailyReminder: boolean;
}): Promise<"sent" | "already_available" | "address_unavailable" | "send_failed"> {
  if ((await getAccountDeliverableEmail(input.accountId)) === input.email) return "already_available";
  const occupied = await query(
    `SELECT 1 FROM user_accounts
     WHERE id<>$2 AND (lower(email)=$1 OR lower(contact_email)=$1)
     UNION ALL
     SELECT 1 FROM user_oauth_identities
     WHERE lower(provider_email)=$1 AND provider_email_verified=TRUE
       AND user_account_id<>$2
     LIMIT 1`,
    [input.email, input.accountId]
  );
  if (occupied.rows.length) return "address_unavailable";
  const { rows } = await query<{ token_version: number; contact_email_verify_version: number }>(
    `UPDATE user_accounts
       SET contact_email_verify_version=contact_email_verify_version+1
     WHERE id=$1 AND erasure_requested_at IS NULL
     RETURNING token_version, contact_email_verify_version`,
    [input.accountId]
  );
  if (!rows[0]) return "address_unavailable";
  const token = await new SignJWT({
    purpose: "contact-email",
    email: input.email,
    tv: rows[0].token_version,
    cv: rows[0].contact_email_verify_version,
    dailyReminder: input.dailyReminder,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("contact-email")
    .setSubject(input.accountId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(signingKey());
  const url = `${getSiteUrl()}/auth/user/verify-contact-email#token=${encodeURIComponent(token)}`;
  const sent = await sendEmail({
    to: input.email,
    subject: "Zovus — подтвердите адрес для уведомлений",
    text: `Подтвердите контактный адрес в аккаунте Zovus: ${url}\nСсылка действует 24 часа. Если вы не добавляли этот адрес, проигнорируйте письмо.`,
    html: `<p>Подтвердите контактный адрес в аккаунте Zovus.</p><p><a href="${url}">Подтвердить адрес</a></p><p>Ссылка действует 24 часа. Если вы не добавляли этот адрес, проигнорируйте письмо.</p>`,
    template: "contact_email_verification",
  });
  return sent ? "sent" : "send_failed";
}

export async function verifyContactEmail(accountId: string, token: string): Promise<{
  dailyCardsReminder: boolean;
}> {
  const { payload } = await jwtVerify(token, signingKey(), {
    algorithms: ["HS256"],
    audience: "contact-email",
  });
  const email = normalizeContactEmail(payload.email);
  if (payload.purpose !== "contact-email" || payload.sub !== accountId || !email) {
    throw new Error("invalid_verification");
  }
  await withTransaction(async (client) => {
    await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [
      `contact-email:${email}`,
    ]);
    const { rows } = await queryClient<{
      token_version: number;
      contact_email_verify_version: number;
      profile_user_id: string | null;
      email: string;
      bonus_email_verification_required: boolean;
    }>(client, `SELECT ua.token_version, ua.contact_email_verify_version,
       ua.profile_user_id, ua.email, ua.bonus_email_verification_required
       FROM user_accounts ua
       WHERE ua.id=$1 AND ua.erasure_requested_at IS NULL FOR UPDATE`, [accountId]);
    const account = rows[0];
    if (!account || account.token_version !== payload.tv ||
        account.contact_email_verify_version !== payload.cv) {
      throw new Error("invalid_verification");
    }
    const occupied = await queryClient(client,
      `SELECT 1 FROM user_accounts WHERE id<>$2
         AND (lower(email)=$1 OR lower(contact_email)=$1)
       UNION ALL SELECT 1 FROM user_oauth_identities
         WHERE user_account_id<>$2 AND provider_email_verified=TRUE
           AND lower(provider_email)=$1
       LIMIT 1`, [email, accountId]);
    if (occupied.rows.length) throw new Error("address_unavailable");
    await queryClient(client,
      `UPDATE user_accounts SET contact_email=$2,
         contact_email_verified_at=NOW(),
         contact_email_verify_version=contact_email_verify_version+1,
         email_verified_at=CASE WHEN lower(email)=$2
           THEN COALESCE(email_verified_at,NOW()) ELSE email_verified_at END,
         bonus_email_verification_required=CASE WHEN lower(email)=$2
           THEN FALSE ELSE bonus_email_verification_required END,
         daily_cards_reminder=CASE WHEN $3 THEN TRUE ELSE daily_cards_reminder END
       WHERE id=$1`, [accountId, email, payload.dailyReminder === true]);
    if (account.bonus_email_verification_required &&
        account.email.toLowerCase() === email && account.profile_user_id) {
      await grantStarterRunesIfNeeded(account.profile_user_id, client);
    }
    if (payload.dailyReminder === true && account.profile_user_id) {
      await queryClient(client,
        `UPDATE users SET notification_prefs=COALESCE(notification_prefs,'{}'::jsonb)
          || '{"dailyEmail":true,"dailyInApp":true}'::jsonb
         WHERE id=$1`, [account.profile_user_id]);
    }
  });
  return { dailyCardsReminder: (await getContactEmailStatus(accountId)).dailyCardsReminder };
}

export async function removeContactEmail(accountId: string): Promise<void> {
  await query(
    `UPDATE user_accounts SET contact_email=NULL, contact_email_verified_at=NULL,
       contact_email_verify_version=contact_email_verify_version+1
     WHERE id=$1 AND erasure_requested_at IS NULL`, [accountId]
  );
}
