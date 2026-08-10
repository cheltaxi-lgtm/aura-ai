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

/** Site → bot: a paid async report finished — push the ready notice. */
export async function handleReportReadyNotify(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/internal/report-ready") return false;
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
    cta_url?: unknown;
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
      : "Отчёт готов";
  const ctaUrl =
    typeof body.cta_url === "string" && /^https:\/\/[a-z0-9.-]*zovus\.ru\//i.test(body.cta_url)
      ? body.cta_url.slice(0, 512)
      : botConfig.siteUrl;

  const user = getDb()
    .prepare(`SELECT chat_id FROM bot_users WHERE telegram_user_id = ?`)
    .get(tgId) as { chat_id: number } | undefined;
  if (!user?.chat_id) {
    json(res, 200, { ok: true, delivered: false, reason: "no_chat" });
    return true;
  }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botConfig.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.chat_id,
        text: copy.reportReady(title),
        reply_markup: {
          inline_keyboard: [[{ text: copy.reportReadyOpen, url: ctaUrl }]],
        },
      }),
    });
    if (!tgRes.ok) {
      console.error("[report-ready] send failed", tgRes.status);
      json(res, 200, { ok: true, delivered: false, reason: "telegram_error" });
      return true;
    }
  } catch (err) {
    console.error("[report-ready]", err);
    json(res, 200, { ok: true, delivered: false, reason: "send_error" });
    return true;
  }

  json(res, 200, { ok: true, delivered: true });
  return true;
}
