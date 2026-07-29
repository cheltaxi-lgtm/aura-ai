import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { botConfig } from "../config.js";
import { setZovusUserId } from "../db/repos.js";

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

/** Site → bot: Telegram Login Widget linked an account. */
export async function handleAccountLinked(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/internal/account-linked") return false;
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }
  if (!secretOk(req)) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  let body: { telegram_user_id?: unknown; zovus_user_id?: unknown };
  try {
    body = JSON.parse(await readBody(req)) as {
      telegram_user_id?: unknown;
      zovus_user_id?: unknown;
    };
  } catch {
    json(res, 400, { ok: false, error: "invalid_json" });
    return true;
  }

  const tgId = Number(body.telegram_user_id);
  if (!Number.isInteger(tgId) || tgId <= 0) {
    json(res, 400, { ok: false, error: "invalid_telegram_user_id" });
    return true;
  }
  const zovus =
    typeof body.zovus_user_id === "string" && body.zovus_user_id.trim()
      ? body.zovus_user_id.trim()
      : null;

  setZovusUserId(tgId, zovus);
  json(res, 200, { ok: true });
  return true;
}
