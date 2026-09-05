import { readInternalBody as readBody } from "./read-body.js";
/**
 * Site admin → bot internal control plane.
 * POST /internal/admin  { action, ... }
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { botConfig } from "../config.js";
import {
  adminBan,
  adminListEvents,
  adminListUsers,
  adminSetFlag,
  buildAdminDashboard,
  listFlags,
} from "../admin/dashboard.js";
import { audit, deleteUserData } from "../db/repos.js";
import { hasActivePollingUser } from "../ops/polling.js";
import { hasActiveUserOperation } from "../middleware/activity.js";
import { beginUserErasure, completeUserErasure } from "../domain/user-erasure.js";

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
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    console.warn(
      "[admin-api] unauthorized",
      req.socket.remoteAddress || "unknown"
    );
  }
  return ok;
}


type AdminAction =
  | "dashboard"
  | "users"
  | "events"
  | "flags"
  | "set_flag"
  | "ban"
  | "unban"
  | "user"
  | "begin_user_erasure"
  | "complete_user_erasure"
  | "delete_user";

export async function handleAdminApi(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  if (path !== "/internal/admin") return false;

  if (req.method === "GET") {
    if (!secretOk(req)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return true;
    }
    json(res, 200, { ok: true, service: "bot-admin", actions: [
      "dashboard",
      "users",
      "events",
      "flags",
      "set_flag",
      "ban",
      "unban",
      "user",
      "delete_user",
      "begin_user_erasure",
      "complete_user_erasure",
    ] });
    return true;
  }

  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "method_not_allowed" });
    return true;
  }

  if (!secretOk(req)) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return true;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    json(res, 400, { ok: false, error: "invalid_json" });
    return true;
  }

  const action = String(body.action || "dashboard") as AdminAction;
  const actor =
    typeof body.actor === "string" && body.actor.trim()
      ? body.actor.trim().slice(0, 120)
      : "admin-web";

  try {
    switch (action) {
      case 'begin_user_erasure':
      case 'complete_user_erasure': {
        const id = Number(body.telegram_user_id);
        const operation = typeof body.operation_id === 'string' ? body.operation_id : '';
        if (!Number.isSafeInteger(id) || id <= 0 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation)) {
          json(res, 400, { ok: false, error: 'invalid_erasure_request' });
          return true;
        }
        const ok = action === 'begin_user_erasure' ? beginUserErasure(id, operation) : completeUserErasure(id, operation);
        json(res, ok ? 200 : 409, ok
          ? { ok: true, ...(action === 'begin_user_erasure' ? { deleted: true } : { completed: true }) }
          : { ok: false, error: 'erasure_pending' });
        return true;
      }
      case "dashboard": {
        json(res, 200, buildAdminDashboard());
        return true;
      }
      case "flags": {
        json(res, 200, { ok: true, flags: listFlags() });
        return true;
      }
      case "set_flag": {
        const key = typeof body.key === "string" ? body.key : "";
        const enabled = Boolean(body.enabled);
        const result = adminSetFlag(key, enabled, actor);
        json(res, result.ok ? 200 : 400, result);
        return true;
      }
      case "users": {
        const filterRaw = String(body.filter || "all");
        const allowed = ["all", "linked", "banned", "blocked", "active7d"] as const;
        const filter = (allowed as readonly string[]).includes(filterRaw)
          ? (filterRaw as (typeof allowed)[number])
          : "all";
        const result = adminListUsers({
          limit: Number(body.limit) || 50,
          q: typeof body.q === "string" ? body.q : "",
          filter,
        });
        json(res, 200, { ok: true, ...result });
        return true;
      }
      case "user": {
        const tgId = Number(body.telegram_user_id);
        if (!Number.isInteger(tgId) || tgId <= 0) {
          json(res, 400, { ok: false, error: "invalid_telegram_user_id" });
          return true;
        }
        const listed = adminListUsers({ limit: 1, q: String(tgId) });
        const user = listed.items.find((u) => u.telegram_user_id === tgId) || null;
        const events = adminListEvents({ limit: 40, telegramUserId: tgId });
        json(res, 200, { ok: true, user, events });
        return true;
      }
      case "delete_user": {
        const tgId = Number(body.telegram_user_id);
        if (!Number.isInteger(tgId) || tgId <= 0) {
          json(res, 400, { ok: false, error: "invalid_telegram_user_id" });
          return true;
        }
        if (hasActivePollingUser(tgId) || hasActiveUserOperation(tgId)) {
          json(res, 409, { ok: false, error: "user_operation_running" });
          return true;
        }
        deleteUserData(tgId);
        audit("delete_user", { telegram_user_id: tgId }, actor);
        json(res, 200, { ok: true, deleted: true });
        return true;
      }
      case "events": {
        const events = adminListEvents({
          limit: Number(body.limit) || 80,
          name: typeof body.name === "string" ? body.name : undefined,
          telegramUserId:
            body.telegram_user_id != null ? Number(body.telegram_user_id) : undefined,
        });
        json(res, 200, { ok: true, events });
        return true;
      }
      case "ban":
      case "unban": {
        const tgId = Number(body.telegram_user_id);
        if (!Number.isInteger(tgId) || tgId <= 0) {
          json(res, 400, { ok: false, error: "invalid_telegram_user_id" });
          return true;
        }
        const result = adminBan(tgId, action === "ban", actor);
        json(res, result.ok ? 200 : 404, result);
        return true;
      }
      default: {
        json(res, 400, { ok: false, error: "unknown_action" });
        return true;
      }
    }
  } catch (err) {
    console.error("[admin-api]", err);
    json(res, 500, { ok: false, error: "internal_error" });
    return true;
  }
}
