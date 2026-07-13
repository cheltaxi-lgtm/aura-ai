import { query, queryClient, withTransaction } from "@/lib/db";
import { findUserByEmail } from "@/lib/accounts";
import { normalizeAuthEmail } from "@/lib/auth";
import type { OAuthProvider, OAuthUserInfo } from "./types";

export interface OAuthIdentityRow {
  id: string;
  user_account_id: string;
  provider: OAuthProvider;
  provider_user_id: string;
  provider_email: string | null;
}

export async function findOAuthIdentity(
  provider: OAuthProvider,
  providerUserId: string
): Promise<(OAuthIdentityRow & { account_email: string; account_name: string }) | null> {
  const { rows } = await query<OAuthIdentityRow & { account_email: string; account_name: string }>(
    `SELECT oi.id, oi.user_account_id, oi.provider, oi.provider_user_id, oi.provider_email,
            ua.email AS account_email, ua.name AS account_name
     FROM user_oauth_identities oi
     JOIN user_accounts ua ON ua.id = oi.user_account_id
     WHERE oi.provider = $1 AND oi.provider_user_id = $2
     LIMIT 1`,
    [provider, providerUserId]
  );
  return rows[0] ?? null;
}

function syntheticOAuthEmail(provider: OAuthProvider, providerUserId: string): string {
  return `${provider}_${providerUserId}@oauth.zovus.local`;
}

export function resolveOAuthAccountEmail(info: OAuthUserInfo, provider: OAuthProvider): string {
  if (info.email) return normalizeAuthEmail(info.email);
  return normalizeAuthEmail(syntheticOAuthEmail(provider, info.providerUserId));
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
  const existingIdentity = await findOAuthIdentity(opts.provider, opts.info.providerUserId);
  if (existingIdentity) {
    return {
      accountId: existingIdentity.user_account_id,
      email: existingIdentity.account_email,
      name: existingIdentity.account_name,
      isNewUser: false,
    };
  }

  const email = resolveOAuthAccountEmail(opts.info, opts.provider);
  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    throw new Error("EMAIL_ACCOUNT_EXISTS");
  }

  if (!opts.consent) {
    throw new Error("CONSENT_REQUIRED");
  }

  const trimmedName = opts.info.name.trim().slice(0, 80) || "Искатель";

  return withTransaction(async (client) => {
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
        opts.consent!.termsAcceptedAt,
        opts.consent!.ageConfirmedAt,
        opts.consent!.marketingConsent,
        opts.consent!.marketingConsentAt,
      ]
    );
    const account = accountResult.rows[0];
    if (!account) throw new Error("oauth_account_create_failed");

    await queryClient(
      client,
      `INSERT INTO user_oauth_identities (user_account_id, provider, provider_user_id, provider_email)
       VALUES ($1, $2, $3, $4)`,
      [account.id, opts.provider, opts.info.providerUserId, opts.info.email]
    );

    return {
      accountId: account.id,
      email: account.email,
      name: account.name,
      isNewUser: true,
    };
  });
}

export async function linkOAuthIdentityToAccount(
  accountId: string,
  provider: OAuthProvider,
  info: OAuthUserInfo
): Promise<void> {
  await query(
    `INSERT INTO user_oauth_identities (user_account_id, provider, provider_user_id, provider_email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [accountId, provider, info.providerUserId, info.email]
  );
}
