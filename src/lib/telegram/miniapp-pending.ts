import { query } from "@/lib/db";
import { sanitizeMiniAppPath } from "@/lib/telegram/mini-app";

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS telegram_miniapp_pending (
      telegram_user_id BIGINT PRIMARY KEY,
      path TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  ensured = true;
}

/** Bot CTA sets where the single Mini App should go next. */
export async function setMiniAppPending(
  telegramUserId: number,
  pathOrUrl: string
): Promise<string> {
  await ensureTable();
  const path = sanitizeMiniAppPath(pathOrUrl);
  await query(
    `INSERT INTO telegram_miniapp_pending (telegram_user_id, path, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (telegram_user_id)
     DO UPDATE SET path = EXCLUDED.path, updated_at = NOW()`,
    [telegramUserId, path]
  );
  return path;
}

/** Consume pending destination (one-shot). */
export async function takeMiniAppPending(
  telegramUserId: number
): Promise<string | null> {
  await ensureTable();
  const { rows } = await query<{ path: string }>(
    `DELETE FROM telegram_miniapp_pending
     WHERE telegram_user_id = $1
       AND updated_at > NOW() - INTERVAL '30 minutes'
     RETURNING path`,
    [telegramUserId]
  );
  const path = rows[0]?.path;
  return path ? sanitizeMiniAppPath(path) : null;
}
