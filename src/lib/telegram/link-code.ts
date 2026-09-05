import { createHash, randomBytes } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { linkTelegramToAccount } from "@/lib/telegram/accounts";
import { LINK_CODE_HEX_LEN } from "@/lib/telegram/link-code-format";
import { notifyBotAccountLinked } from "@/lib/telegram/notify-bot-link";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import type { TelegramLoginPayload } from "@/lib/telegram/verify";

export { isValidLinkCode, LINK_CODE_HEX_LEN } from "@/lib/telegram/link-code-format";

const TTL_MS = 10 * 60 * 1000;

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
}

/** Short single-use code for bot → site link (not an auth credential). */
export function newLinkCode(): string {
  return randomBytes(LINK_CODE_HEX_LEN / 2).toString("hex");
}

export function hashLinkCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

export async function createBotLinkCode(input: {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  photoUrl?: string | null;
}): Promise<{ code: string; linkUrl: string; expiresAt: string }> {
  const code = newLinkCode();
  const token = hashLinkCode(code);
  const expiresAt = new Date(Date.now() + TTL_MS);

  // Serializes with erasure acceptance/final cleanup even though an unused
  // challenge has no account FK. Never write new link PII during erasure.
  await withTransaction(async (client) => {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`telegram:${input.telegramUserId}`]);
  const erasing = await client.query(`SELECT id FROM account_erasure_jobs
    WHERE stage <> 'completed' AND telegram_user_ids @> ARRAY[$1::bigint] LIMIT 1`, [input.telegramUserId]);
  if (erasing.rows[0]) throw new Error("account_erasure_pending");

  // Invalidate previous unused link codes for this telegram user.
  await client.query(
    `UPDATE telegram_auth_challenges
     SET status = 'expired'
     WHERE purpose = 'link'
       AND status IN ('pending', 'confirmed')
       AND telegram_user_id = $1`,
    [input.telegramUserId]
  );

  await client.query(
    `INSERT INTO telegram_auth_challenges (
       token, purpose, telegram_user_id, telegram_username, telegram_first_name, telegram_photo_url,
       accepted_terms, age_confirmed, marketing_consent, expires_at, confirmed_at, status
     ) VALUES ($1, 'link', $2, $3, $4, $5, FALSE, FALSE, FALSE, $6, NOW(), 'confirmed')`,
    [
      token,
      input.telegramUserId,
      input.username ?? null,
      input.firstName ?? null,
      input.photoUrl ?? null,
      expiresAt.toISOString(),
    ]
  );
  });
  return {
    code,
    linkUrl: `${siteBase()}/auth/telegram-link?code=${encodeURIComponent(code)}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function peekLinkCode(code: string): Promise<{
  status: "pending" | "confirmed" | "consumed" | "expired" | "not_found";
  telegramUsername: string | null;
  expiresAt: string | null;
}> {
  const token = hashLinkCode(code);
  const { rows } = await query<{
    status: "pending" | "confirmed" | "consumed" | "expired";
    telegram_username: string | null;
    expires_at: Date | string;
  }>(
    `SELECT status, telegram_username, expires_at
     FROM telegram_auth_challenges
     WHERE token = $1 AND purpose = 'link'
     LIMIT 1`,
    [token]
  );
  const row = rows[0];
  if (!row) return { status: "not_found", telegramUsername: null, expiresAt: null };
  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at);
  if (row.status !== "consumed" && Date.parse(expiresAt) <= Date.now()) {
    await query(
      `UPDATE telegram_auth_challenges SET status = 'expired'
       WHERE token = $1 AND status IN ('pending', 'confirmed')`,
      [token]
    );
    return { status: "expired", telegramUsername: row.telegram_username, expiresAt };
  }
  return {
    status: row.status,
    telegramUsername: row.telegram_username,
    expiresAt,
  };
}

export async function consumeLinkCodeForAccount(input: {
  code: string;
  accountId: string;
}): Promise<
  | { ok: true; username: string | null; alreadyLinked: boolean }
  | { ok: false; error: string; message: string }
> {
  const token = hashLinkCode(input.code);
  const { rows } = await query<{
    status: string;
    telegram_user_id: string | null;
    telegram_username: string | null;
    telegram_first_name: string | null;
    telegram_photo_url: string | null;
    expires_at: Date | string;
  }>(
    `SELECT status, telegram_user_id::text, telegram_username, telegram_first_name, telegram_photo_url, expires_at
     FROM telegram_auth_challenges
     WHERE token = $1 AND purpose = 'link'
     LIMIT 1`,
    [token]
  );
  const row = rows[0];
  if (!row) {
    return { ok: false, error: "not_found", message: "Код не найден. Запросите новую ссылку в боте." };
  }
  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at);
  if (row.status === "consumed") {
    return { ok: false, error: "consumed", message: "Этот код уже использован. Запросите новый в боте." };
  }
  if (row.status === "expired" || Date.parse(expiresAt) <= Date.now()) {
    await query(`UPDATE telegram_auth_challenges SET status = 'expired' WHERE token = $1`, [token]);
    return { ok: false, error: "expired", message: "Срок кода истёк. Запросите новую ссылку в боте." };
  }
  if (!row.telegram_user_id) {
    return { ok: false, error: "incomplete", message: "Код повреждён. Запросите новый в боте." };
  }

  const data: TelegramLoginPayload = {
    id: Number(row.telegram_user_id),
    first_name: row.telegram_first_name?.trim() || "Telegram",
    username: row.telegram_username ?? undefined,
    photo_url: row.telegram_photo_url ?? undefined,
    auth_date: Math.floor(Date.now() / 1000),
    hash: "link_code",
  };

  const linked = await linkTelegramToAccount({
    accountId: input.accountId,
    data,
  });
  if (!linked.ok) {
    const message =
      linked.code === "erasure_pending"
        ? "Удаление аккаунта ещё выполняется. Дождитесь завершения, прежде чем привязывать Telegram."
        : linked.code === "telegram_taken"
        ? "Этот Telegram уже привязан к другому аккаунту."
        : "К аккаунту уже привязан другой Telegram.";
    return { ok: false, error: linked.code, message };
  }

  await query(
    `UPDATE telegram_auth_challenges
     SET status = 'consumed', user_account_id = $2, consumed_at = NOW()
     WHERE token = $1`,
    [token, input.accountId]
  );

  const profileUserId = await getProfileUserIdForAccount(input.accountId);
  void notifyBotAccountLinked({
    telegramUserId: data.id,
    profileUserId,
  });

  return {
    ok: true,
    username: linked.username,
    alreadyLinked: linked.alreadyLinked,
  };
}
