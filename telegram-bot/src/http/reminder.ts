import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { getDb } from "../db/client.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function secretOk(req: IncomingMessage): boolean {
  const expected = botConfig.internalSecret;
  if (!expected) return false;
  const provided = String(req.headers["x-bot-internal-secret"] || "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeHttpsZovus(url: unknown, fallback: string): string {
  if (typeof url !== "string") return fallback;
  if (!/^https:\/\/[a-z0-9.-]*zovus\.ru\//i.test(url)) return fallback;
  return url.slice(0, 512);
}

/** Site → bot: daily cards / bonus / win-back reminder. */
export async function handleReminderNotify(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/internal/reminder") return false;
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }
  if (!secretOk(req)) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  let body: {
    telegram_user_id?: unknown;
    title?: unknown;
    body?: unknown;
    cta_url?: unknown;
    cta_label?: unknown;
    unsubscribe_url?: unknown;
  };
  try {
    body = JSON.parse(await readBody(req)) as typeof body;
  } catch {
    json(res, 400, { ok: false, error: "invalid_json" });
    return true;
  }

  const tgId = Number(body.telegram_user_id);
  if (!Number.isInteger(tgId) || tgId <= 0) {
    json(res, 400, { ok: false, error: "invalid_telegram_user_id" });
    return true;
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : "Напоминание Zovus";
  const textBody =
    typeof body.body === "string" && body.body.trim()
      ? body.body.trim().slice(0, 400)
      : "";
  const ctaUrl = safeHttpsZovus(body.cta_url, botConfig.siteUrl);
  const ctaLabel =
    typeof body.cta_label === "string" && body.cta_label.trim()
      ? body.cta_label.trim().slice(0, 48)
      : copy.reminderOpen;
  const unsubUrl = safeHttpsZovus(body.unsubscribe_url, `${botConfig.siteUrl}/cabinet`);

    const user = getDb()
      .prepare(`SELECT chat_id, unsubscribed_at FROM bot_users WHERE telegram_user_id = ?`)
      .get(tgId) as { chat_id: number; unsubscribed_at?: string | null } | undefined;
    if (!user?.chat_id) {
      json(res, 200, { ok: true, delivered: false, reason: "no_chat" });
      return true;
    }
    // Bot-side unsubscribe (/stop) must also silence site-originated reminders.
    if (user.unsubscribed_at) {
      json(res, 200, { ok: true, delivered: false, reason: "unsubscribed" });
      return true;
    }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botConfig.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.chat_id,
        text: copy.reminder(title, textBody),
        reply_markup: {
          inline_keyboard: [
            [{ text: ctaLabel, url: ctaUrl }],
            [{ text: copy.reminderDisable, url: unsubUrl }],
          ],
        },
      }),
    });
    if (!tgRes.ok) {
      console.error("[reminder] send failed", tgRes.status);
      json(res, 200, { ok: true, delivered: false, reason: "telegram_error" });
      return true;
    }
  } catch (err) {
    console.error("[reminder]", err);
    json(res, 200, { ok: true, delivered: false, reason: "send_error" });
    return true;
  }

  json(res, 200, { ok: true, delivered: true });
  return true;
}
