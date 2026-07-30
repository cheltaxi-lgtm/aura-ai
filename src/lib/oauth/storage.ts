import { query, queryClient, type PoolClient } from "@/lib/db";
import { sanitizeRegistrationAttribution } from "@/lib/registration-attribution";
import { createOAuthOpaqueCode, hashOAuthOpaqueCode, isOAuthOpaqueCode } from "./state-cookie";
import type {
  OAuthPendingRegistration,
  OAuthProvider,
  OAuthTransaction,
} from "./types";

function mapAttribution(raw: unknown): Record<string, string> | null {
  const sanitized = sanitizeRegistrationAttribution(raw);
  return sanitized ? (sanitized as Record<string, string>) : null;
}

const TRANSACTION_TTL_MINUTES = 10;
const REGISTRATION_TTL_MINUTES = 15;
/**
 * App deep-link + Custom Tab handoff. Single-use hashed bearer — keep TTL short.
 * Never log the plaintext code; only the hash is stored.
 */
const HANDOFF_TTL_MINUTES = 10;

type TransactionRow = {
  provider: OAuthProvider;
  code_verifier: string;
  redirect_uri: string;
  return_to: string;
  session_id: string | null;
  accepted_terms: boolean;
  age_confirmed: boolean;
  marketing_consent: boolean;
  mode: "login" | "register" | "link";
  app_flow: boolean;
  link_account_id: string | null;
  registration_attribution: unknown;
};

export async function createOAuthTransaction(transaction: OAuthTransaction): Promise<string> {
  const code = createOAuthOpaqueCode();
  const attributionJson = transaction.registrationAttribution
    ? JSON.stringify(transaction.registrationAttribution)
    : null;
  await query(
    `INSERT INTO oauth_transactions (
       code_hash, provider, code_verifier, redirect_uri, return_to, session_id, mode,
       link_account_id, accepted_terms, age_confirmed, marketing_consent, app_flow,
       registration_attribution, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
               NOW() + ($14 * INTERVAL '1 minute'))`,
    [
      hashOAuthOpaqueCode(code),
      transaction.provider,
      transaction.codeVerifier,
      transaction.redirectUri,
      transaction.returnTo,
      transaction.sessionId,
      transaction.mode,
      transaction.linkAccountId ?? null,
      transaction.acceptedTerms,
      transaction.ageConfirmed,
      transaction.marketingConsent,
      transaction.appFlow,
      attributionJson,
      TRANSACTION_TTL_MINUTES,
    ]
  );
  return code;
}

function mapTransactionRow(row: TransactionRow): OAuthTransaction {
  return {
    provider: row.provider,
    codeVerifier: row.code_verifier,
    redirectUri: row.redirect_uri,
    returnTo: row.return_to,
    sessionId: row.session_id,
    acceptedTerms: row.accepted_terms,
    ageConfirmed: row.age_confirmed,
    marketingConsent: row.marketing_consent,
    mode: row.mode,
    appFlow: row.app_flow,
    linkAccountId: row.link_account_id,
    registrationAttribution: mapAttribution(row.registration_attribution),
  };
}

/** Read pending OAuth state without consuming (error redirects need mode/returnTo). */
export async function getOAuthTransaction(code: string): Promise<OAuthTransaction | null> {
  if (!isOAuthOpaqueCode(code)) return null;
  const { rows } = await query<TransactionRow>(
    `SELECT provider, code_verifier, redirect_uri, return_to, session_id, mode,
            link_account_id, accepted_terms, age_confirmed, marketing_consent, app_flow,
            registration_attribution
     FROM oauth_transactions
     WHERE code_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [hashOAuthOpaqueCode(code)]
  );
  return rows[0] ? mapTransactionRow(rows[0]) : null;
}

/** DELETE ... RETURNING makes validation and consumption one atomic operation. */
export async function consumeOAuthTransaction(code: string): Promise<OAuthTransaction | null> {
  if (!isOAuthOpaqueCode(code)) return null;
  const { rows } = await query<TransactionRow>(
    `DELETE FROM oauth_transactions
     WHERE code_hash = $1 AND expires_at > NOW()
     RETURNING provider, code_verifier, redirect_uri, return_to, session_id, mode,
               link_account_id, accepted_terms, age_confirmed, marketing_consent, app_flow,
               registration_attribution`,
    [hashOAuthOpaqueCode(code)]
  );
  return rows[0] ? mapTransactionRow(rows[0]) : null;
}

export async function createPendingOAuthRegistration(
  pending: OAuthPendingRegistration
): Promise<string> {
  const code = createOAuthOpaqueCode();
  const attributionJson = pending.registrationAttribution
    ? JSON.stringify(pending.registrationAttribution)
    : null;
  await query(
    `INSERT INTO oauth_pending_registrations (
       code_hash, provider, provider_user_id, provider_email, provider_email_verified,
       provider_name, provider_gender, return_to, session_id, app_flow,
       registration_attribution, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
               NOW() + ($12 * INTERVAL '1 minute'))`,
    [
      hashOAuthOpaqueCode(code),
      pending.provider,
      pending.info.providerUserId,
      pending.info.email,
      pending.info.emailVerified,
      pending.info.name,
      pending.info.gender ?? null,
      pending.returnTo,
      pending.sessionId,
      pending.appFlow,
      attributionJson,
      REGISTRATION_TTL_MINUTES,
    ]
  );
  return code;
}

type PendingRow = {
  provider: OAuthProvider;
  provider_user_id: string;
  provider_email: string | null;
  provider_email_verified: boolean;
  provider_name: string;
  provider_gender: "male" | "female" | null;
  return_to: string;
  session_id: string | null;
  app_flow: boolean;
  registration_attribution: unknown;
};

function mapPendingRow(row: PendingRow): OAuthPendingRegistration {
  return {
    provider: row.provider,
    info: {
      providerUserId: row.provider_user_id,
      email: row.provider_email,
      emailVerified: row.provider_email_verified,
      name: row.provider_name,
      gender: row.provider_gender ?? undefined,
    },
    returnTo: row.return_to,
    sessionId: row.session_id,
    appFlow: row.app_flow,
    registrationAttribution: mapAttribution(row.registration_attribution),
  };
}

export async function getPendingOAuthRegistration(
  code: string
): Promise<OAuthPendingRegistration | null> {
  if (!isOAuthOpaqueCode(code)) return null;
  const { rows } = await query<PendingRow>(
    `SELECT provider, provider_user_id, provider_email, provider_email_verified,
            provider_name, provider_gender, return_to, session_id, app_flow,
            registration_attribution
     FROM oauth_pending_registrations
     WHERE code_hash = $1 AND expires_at > NOW()
     LIMIT 1`,
    [hashOAuthOpaqueCode(code)]
  );
  return rows[0] ? mapPendingRow(rows[0]) : null;
}

export async function consumePendingOAuthRegistration(
  client: PoolClient,
  code: string
): Promise<OAuthPendingRegistration | null> {
  if (!isOAuthOpaqueCode(code)) return null;
  const { rows } = await queryClient<PendingRow>(
    client,
    `DELETE FROM oauth_pending_registrations
     WHERE code_hash = $1 AND expires_at > NOW()
     RETURNING provider, provider_user_id, provider_email, provider_email_verified,
               provider_name, provider_gender, return_to, session_id, app_flow,
               registration_attribution`,
    [hashOAuthOpaqueCode(code)]
  );
  const row = rows[0];
  return row ? mapPendingRow(row) : null;
}

export async function createOAuthHandoff(accountId: string): Promise<string> {
  const code = createOAuthOpaqueCode();
  await query(
    `INSERT INTO oauth_handoffs (code_hash, account_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))`,
    [hashOAuthOpaqueCode(code), accountId, HANDOFF_TTL_MINUTES]
  );
  return code;
}

export async function consumeOAuthHandoff(code: string): Promise<string | null> {
  if (!isOAuthOpaqueCode(code)) return null;
  const { rows } = await query<{ account_id: string }>(
    `DELETE FROM oauth_handoffs
     WHERE code_hash = $1 AND expires_at > NOW()
     RETURNING account_id`,
    [hashOAuthOpaqueCode(code)]
  );
  return rows[0]?.account_id ?? null;
}
