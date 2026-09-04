import { query, queryClient, withTransaction, type PoolClient } from "@/lib/db";
import { normalizeAuthEmail } from "@/lib/auth";
import {
  displayNameNeedsNormalization,
  normalizeStoredDisplayName,
} from "@/lib/normalize-person-name";
import type { OAuthProvider, OAuthUserInfo } from "./types";

async function maybeNormalizeAccountName(
  client: PoolClient,
  accountId: string,
  currentName: string
): Promise<string> {
  if (!displayNameNeedsNormalization(currentName)) return currentName;
  const cleaned = normalizeStoredDisplayName(currentName);
  if (cleaned === currentName) return currentName;
  await queryClient(client, "UPDATE user_accounts SET name = $2 WHERE id = $1", [
    accountId,
    cleaned,
  ]);
  return cleaned;
}

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
  registrationAttribution?: Record<string, string> | null;
}): Promise<{ accountId: string; email: string; name: string; isNewUser: boolean }> {
  return withTransaction((client) => upsertOAuthAccountWithClient(client, opts));
}

export async function upsertOAuthAccountWithClient(
  client: PoolClient,
  opts: {
    provider: OAuthProvider;
    info: OAuthUserInfo;
    consent?: OAuthAccountConsent | null;
    registrationAttribution?: Record<string, string> | null;
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
    if (opts.consent) {
      await queryClient(
        client,
        `UPDATE user_accounts SET
           terms_accepted_at = COALESCE(terms_accepted_at, $2::timestamptz),
           age_confirmed_at = COALESCE(age_confirmed_at, $3::timestamptz),
           marketing_consent = CASE WHEN $4 THEN TRUE ELSE marketing_consent END,
           marketing_consent_at = CASE
             WHEN $4 THEN COALESCE(marketing_consent_at, $5::timestamptz)
             ELSE marketing_consent_at
           END
         WHERE id = $1`,
        [
          existingIdentity.user_account_id,
          opts.consent.termsAcceptedAt,
          opts.consent.ageConfirmedAt,
          opts.consent.marketingConsent,
          opts.consent.marketingConsentAt,
        ]
      );
    }
    const accountName = await maybeNormalizeAccountName(
      client,
      existingIdentity.user_account_id,
      existingIdentity.account_name
    );
    return {
      accountId: existingIdentity.user_account_id,
      email: existingIdentity.account_email,
      name: accountName,
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
      if (opts.consent) {
        await queryClient(
          client,
          `UPDATE user_accounts SET
             terms_accepted_at = COALESCE(terms_accepted_at, $2::timestamptz),
             age_confirmed_at = COALESCE(age_confirmed_at, $3::timestamptz),
             marketing_consent = CASE WHEN $4 THEN TRUE ELSE marketing_consent END,
             marketing_consent_at = CASE
               WHEN $4 THEN COALESCE(marketing_consent_at, $5::timestamptz)
               ELSE marketing_consent_at
             END
           WHERE id = $1`,
          [
            account.id,
            opts.consent.termsAcceptedAt,
            opts.consent.ageConfirmedAt,
            opts.consent.marketingConsent,
            opts.consent.marketingConsentAt,
          ]
        );
      }
      const accountName = await maybeNormalizeAccountName(client, account.id, account.name);
      return {
        accountId: account.id,
        email: account.email,
        name: accountName,
        isNewUser: false,
      };
    }
  }

  if (!opts.consent) {
    throw new Error("CONSENT_REQUIRED");
  }

  const trimmedName = normalizeStoredDisplayName(opts.info.name, "Гость");

  const attributionJson = opts.registrationAttribution
    ? JSON.stringify(opts.registrationAttribution)
    : null;
  const accountResult = await queryClient<{ id: string; email: string; name: string }>(
    client,
    `INSERT INTO user_accounts (
       email, password_hash, name,
       terms_accepted_at, age_confirmed_at, marketing_consent, marketing_consent_at,
       registration_attribution
     )
     VALUES ($1, NULL, $2, $3::timestamptz, $4::timestamptz, $5, $6::timestamptz, $7::jsonb)
     RETURNING id, email, name`,
    [
      email,
      trimmedName,
      opts.consent.termsAcceptedAt,
      opts.consent.ageConfirmedAt,
      opts.consent.marketingConsent === true,
      opts.consent.marketingConsent === true ? opts.consent.marketingConsentAt : null,
      attributionJson,
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

export type LinkOAuthResult =
  | { ok: true; alreadyLinked: boolean; email: string; name: string }
  | { ok: false; error: "provider_taken" | "account_missing" };

/**
 * Attach a provider identity to an existing account (cabinet / bot shell upgrade).
 * Does not create accounts. Fails if the identity belongs to another account.
 */
export async function linkOAuthIdentityToAccount(
  accountId: string,
  provider: OAuthProvider,
  info: OAuthUserInfo
): Promise<LinkOAuthResult> {
  return withTransaction(async (client) => {
    const account = await queryClient<{ id: string; email: string; name: string }>(
      client,
      `SELECT id, email, name FROM user_accounts WHERE id = $1 FOR UPDATE`,
      [accountId]
    );
    const row = account.rows[0];
    if (!row) return { ok: false, error: "account_missing" };

    const existing = await findOAuthIdentityWithClient(
      client,
      provider,
      info.providerUserId
    );
    if (existing) {
      if (existing.user_account_id !== accountId) {
        return { ok: false, error: "provider_taken" };
      }
      await queryClient(
        client,
        `UPDATE user_oauth_identities
         SET provider_email = $2, provider_email_verified = $3,
             provider_gender = $4, updated_at = NOW(), last_login_at = NOW()
         WHERE id = $1`,
        [
          existing.id,
          info.email ? normalizeAuthEmail(info.email) : null,
          info.emailVerified,
          info.gender ?? null,
        ]
      );
      return {
        ok: true,
        alreadyLinked: true,
        email: row.email,
        name: row.name,
      };
    }

    const providerEmail = info.email ? normalizeAuthEmail(info.email) : null;
    await queryClient(
      client,
      `INSERT INTO user_oauth_identities (
         user_account_id, provider, provider_user_id, provider_email,
         provider_email_verified, provider_gender, last_login_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        accountId,
        provider,
        info.providerUserId,
        providerEmail,
        info.emailVerified,
        info.gender ?? null,
      ]
    );

    // Upgrade synthetic shell email when provider gives a free verified address.
    let email = row.email;
    if (
      shouldUseVerifiedEmailForLinking(info) &&
      providerEmail &&
      (row.email.endsWith("@telegram.zovus.local") ||
        row.email.endsWith("@oauth.zovus.local"))
    ) {
      const taken = await queryClient<{ id: string }>(
        client,
        `SELECT id FROM user_accounts WHERE lower(email) = $1 AND id <> $2 LIMIT 1`,
        [providerEmail, accountId]
      );
      if (!taken.rows[0]) {
        await queryClient(
          client,
          `UPDATE user_accounts SET email = $2 WHERE id = $1`,
          [accountId, providerEmail]
        );
        email = providerEmail;
      }
    }

    return { ok: true, alreadyLinked: false, email, name: row.name };
  });
}

export async function listOAuthProvidersForAccount(
  accountId: string
): Promise<OAuthProvider[]> {
  const { rows } = await query<{ provider: OAuthProvider }>(
    `SELECT provider FROM user_oauth_identities WHERE user_account_id = $1`,
    [accountId]
  );
  return rows.map((r) => r.provider);
}

export type UnlinkOAuthResult =
  | { ok: true; provider: OAuthProvider }
  | { ok: false; error: "not_linked" | "last_login_method" | "invalid_provider" };

/**
 * Detach a provider from the account. Keeps at least one site login method
 * (password, another OAuth, or Telegram bind for Mini App).
 */
export async function unlinkOAuthFromAccount(
  accountId: string,
  provider: OAuthProvider
): Promise<UnlinkOAuthResult> {
  if (provider !== "yandex" && provider !== "vk") {
    return { ok: false, error: "invalid_provider" };
  }

  return withTransaction(async (client) => {
    const account = await queryClient<{
      email: string;
      password_hash: string | null;
    }>(
      client,
      `SELECT email, password_hash FROM user_accounts WHERE id = $1 FOR UPDATE`,
      [accountId]
    );
    if (!account.rows[0]) return { ok: false, error: "not_linked" };

    const identity = await queryClient<{ id: string }>(
      client,
      `SELECT id FROM user_oauth_identities
       WHERE user_account_id = $1 AND provider = $2
       FOR UPDATE`,
      [accountId, provider]
    );
    if (!identity.rows[0]) return { ok: false, error: "not_linked" };

    const others = await queryClient<{ n: string }>(
      client,
      `SELECT COUNT(*)::text AS n FROM user_oauth_identities
       WHERE user_account_id = $1 AND provider <> $2`,
      [accountId, provider]
    );
    const otherOAuth = Number(others.rows[0]?.n || 0);
    const hasPassword = Boolean(account.rows[0].password_hash);
    const tg = await queryClient<{ n: string }>(
      client,
      `SELECT COUNT(*)::text AS n FROM user_telegram_identities
       WHERE user_account_id = $1`,
      [accountId]
    );
    const hasTelegram = Number(tg.rows[0]?.n || 0) > 0;

    if (!hasPassword && otherOAuth === 0 && !hasTelegram) {
      return { ok: false, error: "last_login_method" };
    }

    await queryClient(
      client,
      `DELETE FROM user_oauth_identities WHERE user_account_id = $1 AND provider = $2`,
      [accountId, provider]
    );
    return { ok: true, provider };
  });
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
