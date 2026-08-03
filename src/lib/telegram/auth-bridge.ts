import { randomBytes } from "node:crypto";
import { query } from "@/lib/db";
import type { TelegramLoginPayload } from "@/lib/telegram/verify";

export type BridgePurpose = "login" | "register" | "link";

export type BridgeChallenge = {
  token: string;
  purpose: BridgePurpose;
  status: "pending" | "confirmed" | "consumed" | "expired";
  deepLink: string;
  expiresAt: string;
  telegramUsername?: string | null;
};

const TTL_MS = 10 * 60 * 1000;

function botUsername(): string {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ||
    process.env.TELEGRAM_BOT_USERNAME?.trim() ||
    "zovus_card_bot"
  );
}

function deepLinkFor(token: string): string {
  return `https://t.me/${botUsername()}?start=a_${token}`;
}

function newToken(): string {
  return randomBytes(16).toString("hex"); // 32 hex → start payload a_+32 = 34 chars
}

export async function createTelegramAuthChallenge(input: {
  purpose: BridgePurpose;
  userAccountId?: string | null;
  acceptedTerms?: boolean;
  ageConfirmed?: boolean;
  marketingConsent?: boolean;
}): Promise<BridgeChallenge> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await query(
    `INSERT INTO telegram_auth_challenges (
       token, purpose, user_account_id, accepted_terms, age_confirmed, marketing_consent, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      token,
      input.purpose,
      input.userAccountId ?? null,
      Boolean(input.acceptedTerms),
      Boolean(input.ageConfirmed),
      Boolean(input.marketingConsent),
      expiresAt.toISOString(),
    ]
  );
  return {
    token,
    purpose: input.purpose,
    status: "pending",
    deepLink: deepLinkFor(token),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getTelegramAuthChallenge(token: string): Promise<{
  token: string;
  purpose: BridgePurpose;
  status: BridgeChallenge["status"];
  userAccountId: string | null;
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
  telegramUserId: number | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramPhotoUrl: string | null;
  expiresAt: string;
} | null> {
  const { rows } = await query<{
    token: string;
    purpose: BridgePurpose;
    status: BridgeChallenge["status"];
    user_account_id: string | null;
    accepted_terms: boolean;
    age_confirmed: boolean;
    marketing_consent: boolean;
    telegram_user_id: string | null;
    telegram_username: string | null;
    telegram_first_name: string | null;
    telegram_photo_url: string | null;
    expires_at: Date | string;
  }>(
    `SELECT token, purpose, status, user_account_id, accepted_terms, age_confirmed, marketing_consent,
            telegram_user_id::text, telegram_username, telegram_first_name, telegram_photo_url, expires_at
     FROM telegram_auth_challenges
     WHERE token = $1
     LIMIT 1`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;
  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at);
  let status = row.status;
  if (status === "pending" && Date.parse(expiresAt) <= Date.now()) {
    await query(
      `UPDATE telegram_auth_challenges SET status = 'expired' WHERE token = $1 AND status = 'pending'`,
      [token]
    );
    status = "expired";
  }
  return {
    token: row.token,
    purpose: row.purpose,
    status,
    userAccountId: row.user_account_id,
    acceptedTerms: row.accepted_terms,
    ageConfirmed: row.age_confirmed,
    marketingConsent: row.marketing_consent,
    telegramUserId: row.telegram_user_id ? Number(row.telegram_user_id) : null,
    telegramUsername: row.telegram_username,
    telegramFirstName: row.telegram_first_name,
    telegramPhotoUrl: row.telegram_photo_url,
    expiresAt,
  };
}

export async function confirmTelegramAuthChallenge(input: {
  token: string;
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
}): Promise<{ ok: true; purpose: BridgePurpose } | { ok: false; error: string }> {
  const challenge = await getTelegramAuthChallenge(input.token);
  if (!challenge) return { ok: false, error: "not_found" };
  if (challenge.status === "expired") return { ok: false, error: "expired" };
  if (challenge.status === "consumed") return { ok: false, error: "consumed" };
  if (challenge.status === "confirmed") {
    return { ok: true, purpose: challenge.purpose };
  }
  if (challenge.status !== "pending") return { ok: false, error: "invalid_status" };

  const { rowCount } = await query(
    `UPDATE telegram_auth_challenges
     SET status = 'confirmed',
         telegram_user_id = $2,
         telegram_username = $3,
         telegram_first_name = $4,
         telegram_photo_url = $5,
         confirmed_at = NOW()
     WHERE token = $1 AND status = 'pending' AND expires_at > NOW()`,
    [
      input.token,
      input.telegramUserId,
      input.username ?? null,
      input.firstName ?? null,
      input.photoUrl ?? null,
    ]
  );
  if (!rowCount) return { ok: false, error: "expired" };
  return { ok: true, purpose: challenge.purpose };
}

export function challengeToLoginPayload(challenge: {
  telegramUserId: number | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramPhotoUrl: string | null;
}): TelegramLoginPayload | null {
  if (!challenge.telegramUserId || challenge.telegramUserId <= 0) return null;
  return {
    id: challenge.telegramUserId,
    first_name: challenge.telegramFirstName?.trim() || "Telegram",
    username: challenge.telegramUsername ?? undefined,
    photo_url: challenge.telegramPhotoUrl ?? undefined,
    auth_date: Math.floor(Date.now() / 1000),
    hash: "bridge",
  };
}

export async function markTelegramAuthChallengeConsumed(token: string): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE telegram_auth_challenges
     SET status = 'consumed', consumed_at = NOW()
     WHERE token = $1 AND status = 'confirmed'`,
    [token]
  );
  return Boolean(rowCount);
}
