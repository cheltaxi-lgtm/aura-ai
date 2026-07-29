import { query, withTransaction, queryClient } from "@/lib/db";
import type { TelegramLoginPayload } from "./verify";

export type TelegramIdentityRow = {
  id: string;
  user_account_id: string;
  telegram_user_id: string;
  username: string | null;
  photo_url: string | null;
  first_name: string | null;
  linked_at: string;
};

export async function findTelegramIdentity(
  telegramUserId: number
): Promise<TelegramIdentityRow | null> {
  const { rows } = await query<TelegramIdentityRow>(
    `SELECT id, user_account_id, telegram_user_id::text, username, photo_url, first_name,
            linked_at::text
     FROM user_telegram_identities
     WHERE telegram_user_id = $1
     LIMIT 1`,
    [telegramUserId]
  );
  return rows[0] ?? null;
}

export async function getTelegramStatusForAccount(accountId: string): Promise<{
  linked: boolean;
  telegramUserId?: string;
  username?: string | null;
}> {
  const { rows } = await query<{
    telegram_user_id: string;
    username: string | null;
  }>(
    `SELECT telegram_user_id::text, username
     FROM user_telegram_identities
     WHERE user_account_id = $1
     LIMIT 1`,
    [accountId]
  );
  if (!rows[0]) return { linked: false };
  return {
    linked: true,
    telegramUserId: rows[0].telegram_user_id,
    username: rows[0].username,
  };
}

export type TelegramLoginResult =
  | {
      ok: true;
      accountId: string;
      email: string;
      name: string;
      isNewUser: boolean;
      needsProfile: boolean;
      profileUserId: string | null;
    }
  | { ok: false; code: "consent_required" | "not_found" };

/**
 * Disabled: Telegram must not authenticate users (149-FZ art.8 p.10).
 * Routes return 410; this fails closed if called.
 */
export async function loginOrRegisterTelegram(_opts: {
  data: TelegramLoginPayload;
  mode: "login" | "register";
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
}): Promise<TelegramLoginResult> {
  return { ok: false, code: "not_found" };
}

export type TelegramLinkResult =
  | { ok: true; alreadyLinked: boolean; username: string | null }
  | {
      ok: false;
      code: "telegram_taken" | "account_has_telegram";
    };

export async function linkTelegramToAccount(opts: {
  accountId: string;
  data: TelegramLoginPayload;
}): Promise<TelegramLinkResult> {
  return withTransaction(async (client) => {
    await queryClient(client, "SELECT pg_advisory_xact_lock(hashtext($1))", [
      `telegram:${opts.data.id}`,
    ]);

    const byTg = await queryClient<{ user_account_id: string }>(
      client,
      `SELECT user_account_id FROM user_telegram_identities WHERE telegram_user_id = $1 FOR UPDATE`,
      [opts.data.id]
    );
    if (byTg.rows[0]) {
      if (byTg.rows[0].user_account_id === opts.accountId) {
        await queryClient(
          client,
          `UPDATE user_telegram_identities
           SET username = COALESCE($2, username),
               photo_url = COALESCE($3, photo_url),
               first_name = COALESCE($4, first_name),
               updated_at = NOW()
           WHERE telegram_user_id = $1`,
          [
            opts.data.id,
            opts.data.username ?? null,
            opts.data.photo_url ?? null,
            opts.data.first_name,
          ]
        );
        console.info("[auth] telegram_link", { accountId: opts.accountId, idempotent: true });
        return {
          ok: true as const,
          alreadyLinked: true,
          username: opts.data.username ?? null,
        };
      }
      return { ok: false as const, code: "telegram_taken" as const };
    }

    const byAccount = await queryClient<{ telegram_user_id: string }>(
      client,
      `SELECT telegram_user_id::text FROM user_telegram_identities
       WHERE user_account_id = $1 FOR UPDATE`,
      [opts.accountId]
    );
    if (byAccount.rows[0]) {
      return { ok: false as const, code: "account_has_telegram" as const };
    }

    await queryClient(
      client,
      `INSERT INTO user_telegram_identities (
         user_account_id, telegram_user_id, username, photo_url, first_name, last_login_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        opts.accountId,
        opts.data.id,
        opts.data.username ?? null,
        opts.data.photo_url ?? null,
        opts.data.first_name,
      ]
    );
    console.info("[auth] telegram_link", { accountId: opts.accountId, idempotent: false });
    return {
      ok: true as const,
      alreadyLinked: false,
      username: opts.data.username ?? null,
    };
  });
}
