import type { ServerResponse } from "node:http";
import { isUserErasing } from "../domain/user-erasure.js";
import { withUserActivity } from "../middleware/activity.js";
import { getDb } from "../db/client.js";
import { siteResolve } from "../domain/site-client.js";

export function rejectErasingUser(id: number, res: ServerResponse): boolean {
  if (!isUserErasing(id)) return false;
  res.writeHead(409, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: false, error: "erasure_pending", delivered: false }));
  return true;
}

/** Fence admission synchronously, then keep erasure waiting until all work drains. */
export async function withInternalUserActivity(id: number, res: ServerResponse, work: () => Promise<boolean>): Promise<boolean> {
  if (rejectErasingUser(id, res)) return true;
  return withUserActivity(id, work);
}

/** Bind delayed notices to the source profile, not merely a reusable Telegram ID.
 * Legacy senders are compatible only before this Telegram user's first erasure.
 * Caller holds withInternalUserActivity across this check and the final send.
 */
export async function acceptNotificationIdentity(id: number, sourceProfile: unknown, res: ServerResponse): Promise<boolean> {
  const profile = typeof sourceProfile === 'string' ? sourceProfile.trim() : '';
  const deny = (status: number, reason: string) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: status === 200, delivered: false, reason }));
    return false;
  };
  if (!profile) {
    if (getDb().prepare('SELECT 1 FROM bot_user_erasure WHERE telegram_user_id = ? LIMIT 1').get(id)) {
      return deny(200, 'notification_identity_required');
    }
    return true;
  }
  if (profile.length > 128) return deny(200, 'notification_identity_mismatch');
  try {
    const current = await siteResolve(id);
    if (rejectErasingUser(id, res)) return false;
    if (!current.ok || current.deletionPending) return deny(503, 'notification_identity_unavailable');
    if (!current.linked || current.profileUserId !== profile) return deny(200, 'notification_identity_mismatch');
    return true;
  } catch {
    return deny(503, 'notification_identity_unavailable');
  }
}

export function safeZovusUrl(input: unknown, fallback: string): string {
  if (typeof input !== "string" || input.length > 512) return fallback;
  try {
    const url = new URL(input);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "zovus.ru" || url.hostname.endsWith(".zovus.ru")) ? url.href : fallback;
  } catch { return fallback; }
}
