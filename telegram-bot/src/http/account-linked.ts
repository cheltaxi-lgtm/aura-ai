import { readInternalBody as readBody } from "./read-body.js";
import { withInternalUserActivity, rejectErasingUser } from "./internal-user-activity.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { botConfig } from "../config.js";
import { setZovusUserId } from "../db/repos.js";
import { maybeSendLinkWelcome } from "../domain/link/welcome.js";
import { siteResolve } from "../domain/site-client.js";

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


/** Site → bot: post-auth link-code bound telegram_user_id to a Zovus account. */
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
  return withInternalUserActivity(tgId, res, async () => {
  const zovus =
    typeof body.zovus_user_id === "string" && body.zovus_user_id.trim()
      ? body.zovus_user_id.trim()
      : null;

  // A delayed pre-erasure link callback must not attach a recreated bot profile
  // to the removed site profile. Resolve the currently owned identity first.
  const current = await siteResolve(tgId);
  if (rejectErasingUser(tgId, res)) return true;
  if (!current.ok || current.deletionPending) {
    json(res, 503, { ok: false, error: "account_link_unverified" });
    return true;
  }
  if ((current.profileUserId ?? null) !== zovus || (zovus !== null && !current.linked)) {
    json(res, 409, { ok: false, error: "stale_account_link" });
    return true;
  }
  setZovusUserId(tgId, zovus);
  if (zovus) {
    await maybeSendLinkWelcome(tgId);
  }
  json(res, 200, { ok: true });
  return true;
  });
}
