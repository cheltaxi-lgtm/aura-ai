import { readInternalBody as readBody } from "./read-body.js";
import { acceptNotificationIdentity, withInternalUserActivity } from "./internal-user-activity.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { botConfig } from "../config.js";
import { copy } from "../copy/ru.js";
import { getDb } from "../db/client.js";
import { CB } from "../keyboards/index.js";

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


/** Site → bot: admin answered a support ticket. */
export async function handleSupportReplyNotify(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/internal/support-reply") return false;
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
    source_profile_user_id?: unknown;
    ticket_id?: unknown;
    subject?: unknown;
    preview?: unknown;
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
  return withInternalUserActivity(tgId, res, async () => {
  if (!await acceptNotificationIdentity(tgId, body.source_profile_user_id, res)) return true;
  const ticketId =
    typeof body.ticket_id === "string" && body.ticket_id.trim()
      ? body.ticket_id.trim()
      : "";
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim().slice(0, 160)
      : "обращение";
  const preview =
    typeof body.preview === "string" ? body.preview.trim().slice(0, 800) : "";

  const user = getDb()
    .prepare(`SELECT chat_id FROM bot_users WHERE telegram_user_id = ?`)
    .get(tgId) as { chat_id: number } | undefined;
  if (!user?.chat_id) {
    json(res, 200, { ok: true, delivered: false, reason: "no_chat" });
    return true;
  }

  const text = copy.supportAdminReply(subject, preview);
  const replyBtn = ticketId
    ? [[{ text: "💬 Ответить", callback_data: `${CB.supportReplyPrefix}${ticketId}` }]]
    : [[{ text: "✉️ Поддержка", callback_data: CB.modSupport }]];

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botConfig.token}/sendMessage`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.chat_id,
        text,
        reply_markup: { inline_keyboard: replyBtn },
      }),
    });
    if (!tgRes.ok) {
      console.error("[support-reply] send failed", tgRes.status);
      json(res, 200, { ok: true, delivered: false, reason: "telegram_error" });
      return true;
    }
  } catch (err) {
    console.error("[support-reply]", err);
    json(res, 200, { ok: true, delivered: false, reason: "send_error" });
    return true;
  }

  json(res, 200, { ok: true, delivered: true });
  return true;
  });
}
