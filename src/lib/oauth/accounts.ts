import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { normalizeAuthEmail } from "@/lib/auth";
import type { OAuthProvider, OAuthUserInfo } from "./types";

export interface OAuthIdentityRow {
  id: string;
  user_account_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  provider_email: string | null;
  provider_email_verified: boolean;
  provider_gender: "male" | "female" | null;
}

async function findOAuthIdentityWithClient(
  client: PoolClient,
  provider: OAuthProvider,
  providerUserId: string
): Promise<(OAuthIdentityRow & { account_email: string; account_name: string }) | null> {
  const { rows } = await queryClient<
    OAuthIdentityRow & { account_email: string; account_name: string }
  >(
    client,
    `SELECT oi.id, oi.user_account_id, oi.provider, oi.provider_user_id, oi.provider_email,
            oi.provider_email_verified, oi.provider_gender,
            ua.email AS account_email, ua.name AS account_name
     FROM user_oauth_identities oi
     JOIN user_accounts ua ON ua.id = oi.user_account_id
     WHERE oi.provider = $1 AND oi.provider_user_id = $2
     LIMIT 1
     FOR UPDATE OF oi`,
    [provider, providerUserId]
  );
  return rows[0] ?? null;
}

export async function findOAuthIdentity(
  provider: OAuthProvider,
  providerUserId: string
): Promise<(OAuthIdentityRow & { account_email: string; account_name: string }) | null> {
  return withTransaction((client) => findOAuthIdentityWithClient(client, provider, providerUserId));
}

function syntheticOAuthEmail(provider: OAuthProvider, providerUserId: string): string {
  return `${provider}_${providerUserId}@oauth.zovus.local`;
}

export function resolveOAuthAccountEmail(info: OAuthUserInfo, provider: OAuthProvider): string {
  if (shouldUseVerifiedEmailForLinking(info)) return normalizeAuthEmail(info.email!);
  return normalizeAuthEmail(syntheticOAuthEmail(provider, info.providerUserId));
}

export function shouldUseVerifiedEmailForLinking(info: OAuthUserInfo): boolean {
  return info.emailVerified && Boolean(info.email?.trim());
}

export type OAuthAccountConsent = {
  termsAcceptedAt: string;
  ageConfirmedAt: string;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
};

export async function upsertOAuthAccount(opts: {
  provider: OAuthProvider;
  info: OAuthUserInfo;
  consent?: OAuthAccountConsent | null;
}): Promise<{ accountId: string; email: string; name: string; isNewUser: boolean }> {
  return withTransaction((client) => upsertOAuthAccountWithClient(client, opts));
}

export async function upsertOAuthAccountWithClient(
  client: PoolClient,
  opts: {
    provider: OAuthProvider;
    info: OAuthUserInfo;
    consent?: OAuthAccountConsent | null;
  }
): Promise<{ accountId: string; email: string; name: string; isNewUser: boolean }> {
  // Serialize all attempts for one provider identity, including first-time inserts.
  await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [
    `oauth:${opts.provider}:${opts.info.providerUserId}`,
  ]);

  const normalizedProviderEmail = opts.info.email
    ? normalizeAuthEmail(opts.info.email)
    : null;
  if (shouldUseVerifiedEmailForLinking(opts.info) && normalizedProviderEmail) {
    // Different provider identities can concurrently claim the same verified email.
    await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [
      `oauth-email:${normalizedProviderEmail}`,
    ]);
  }

  const existingIdentity = await findOAuthIdentityWithClient(
    client,
    opts.provider,
    opts.info.providerUserId
  );
  if (existingIdentity) {
    await queryClient(
      client,
      `UPDATE user_oauth_identities
       SET provider_email = $2, provider_email_verified = $3,
           provider_gender = $4, updated_at = NOW(), last_login_at = NOW()
       WHERE id = $1`,
      [
        existingIdentity.id,
        normalizedProviderEmail,
        opts.info.emailVerified,
        opts.info.gender ?? null,
      ]
    );
    return {
      accountId: existingIdentity.user_account_id,
      email: existingIdentity.account_email,
      name: existingIdentity.account_name,
      isNewUser: false,
    };
  }

  const email = resolveOAuthAccountEmail(opts.info, opts.provider);
  if (shouldUseVerifiedEmailForLinking(opts.info) && normalizedProviderEmail) {
    const linked = await queryClient<{ id: string; email: string; name: string }>(
      client,
      `SELECT id, email, name FROM user_accounts
       WHERE lower(email) = $1
       LIMIT 1
       FOR UPDATE`,
      [normalizedProviderEmail]
    );
    const account = linked.rows[0];
    if (account) {
      await queryClient(
        client,
        `INSERT INTO user_oauth_identities (
           user_account_id, provider, provider_user_id, provider_email,
           provider_email_verified, provider_gender, last_login_at
         ) VALUES ($1, $2, $3, $4, TRUE, $5, NOW())`,
        [
          account.id,
          opts.provider,
          opts.info.providerUserId,
          normalizedProviderEmail,
          opts.info.gender ?? null,
        ]
      );
      return {
        accountId: account.id,
        email: account.email,
        name: account.name,
        isNewUser: false,
      };
    }
  }

  if (!opts.consent) {
    throw new Error("CONSENT_REQUIRED");
  }

  const trimmedName = opts.info.name.trim().slice(0, 80) || "Гость";

  const accountResult = await queryClient<{ id: string; email: string; name: string }>(
    client,
    `INSERT INTO user_accounts (
       email, password_hash, name,
       terms_accepted_at, age_confirmed_at, marketing_consent, marketing_consent_at
     )
     VALUES ($1, NULL, $2, $3::timestamptz, $4::timestamptz, $5, $6::timestamptz)
     RETURNING id, email, name`,
    [
      email,
      trimmedName,
      opts.consent.termsAcceptedAt,
      opts.consent.ageConfirmedAt,
      opts.consent.marketingConsent,
      opts.consent.marketingConsentAt,
    ]
  );
  const account = accountResult.rows[0];
  if (!account) throw new Error("oauth_account_create_failed");

  await queryClient(
    client,
    `INSERT INTO user_oauth_identities (
       user_account_id, provider, provider_user_id, provider_email,
       provider_email_verified, provider_gender, last_login_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      account.id,
      opts.provider,
      opts.info.providerUserId,
      normalizedProviderEmail,
      opts.info.emailVerified,
      opts.info.gender ?? null,
    ]
  );

  return {
    accountId: account.id,
    email: account.email,
    name: account.name,
    isNewUser: true,
  };
}

export async function linkOAuthIdentityToAccount(
  accountId: string,
  provider: OAuthProvider,
  info: OAuthUserInfo
): Promise<void> {
  await query(
    `INSERT INTO user_oauth_identities (
       user_account_id, provider, provider_user_id, provider_email,
       provider_email_verified, provider_gender, last_login_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (provider, provider_user_id) DO UPDATE
       SET provider_email = EXCLUDED.provider_email,
           provider_email_verified = EXCLUDED.provider_email_verified,
           provider_gender = EXCLUDED.provider_gender,
           updated_at = NOW(),
           last_login_at = NOW()
     WHERE user_oauth_identities.user_account_id = EXCLUDED.user_account_id`,
    [
      accountId,
      provider,
      info.providerUserId,
      info.email,
      info.emailVerified,
      info.gender ?? null,
    ]
  );
}

export async function getLatestOAuthGenderForAccount(
  accountId: string
): Promise<"male" | "female" | null> {
  const { rows } = await query<{ provider_gender: "male" | "female" | null }>(
    `SELECT provider_gender
     FROM user_oauth_identities
     WHERE user_account_id = $1 AND provider_gender IS NOT NULL
     ORDER BY last_login_at DESC NULLS LAST, updated_at DESC
     LIMIT 1`,
    [accountId]
  );
  return rows[0]?.provider_gender ?? null;
}
