import { botConfig } from "../../config.js";
import { getDb, nowIso } from "../../db/client.js";
import { copy } from "../../copy/ru.js";
import { siteWebAppUrl } from "../site-client.js";

/** One-time salon message after Zovus account is linked (link-code or claim). */
export async function maybeSendLinkWelcome(telegramUserId: number): Promise<void> {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT chat_id, zovus_user_id, link_welcomed_at FROM bot_users WHERE telegram_user_id = ?`
    )
    .get(telegramUserId) as
    | { chat_id: number; zovus_user_id: string | null; link_welcomed_at: string | null }
    | undefined;

  if (!user?.zovus_user_id || user.link_welcomed_at) return;

  const now = nowIso();
  const updated = db
    .prepare(
      `UPDATE bot_users SET link_welcomed_at = ?, updated_at = ?
       WHERE telegram_user_id = ? AND link_welcomed_at IS NULL AND zovus_user_id IS NOT NULL`
    )
    .run(now, now, telegramUserId);
  if (updated.changes !== 1) return;

  const text = copy.linkWelcome(telegramUserId, 0);
  const continueUrl = siteWebAppUrl(
    `${botConfig.siteUrl}/?utm_source=telegram&utm_medium=bot&utm_campaign=link_welcome`
  );
  try {
    const res = await fetch(`https://api.telegram.org/bot${botConfig.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.chat_id,
        text,
        reply_markup: {
          inline_keyboard: [
            [{ text: `🕯 ${copy.continueReading}`, web_app: { url: continueUrl } }],
          ],
        },
      }),
    });
    if (!res.ok) {
      console.error("[link-welcome] send failed", res.status);
    }
  } catch (err) {
    console.error("[link-welcome]", err);
  }
}
