/**
 * Site → Telegram bot admin control plane (BOT_INTERNAL_*).
 */

const ADMIN_TIMEOUT_MS = 12_000;

function botBase(): string {
  return (process.env.BOT_INTERNAL_BASE_URL || "").replace(/\/$/, "");
}

function botSecret(): string {
  return process.env.BOT_INTERNAL_SECRET?.trim() || "";
}

export function isBotAdminConfigured(): boolean {
  return Boolean(botBase() && botSecret());
}

export type BotAdminAction =
  | "dashboard"
  | "users"
  | "events"
  | "flags"
  | "set_flag"
  | "ban"
  | "unban"
  | "user";

export async function callBotAdmin(
  action: BotAdminAction,
  body: Record<string, unknown> = {},
  actor = "admin-web"
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const base = botBase();
  const secret = botSecret();
  if (!base || !secret) {
    return {
      ok: false,
      status: 503,
      data: { ok: false, error: "bot_not_configured" },
    };
  }

  try {
    const res = await fetch(`${base}/internal/admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": secret,
      },
      body: JSON.stringify({ action, actor, ...body }),
      signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = { ok: false, error: "invalid_bot_response" };
    }
    return { ok: res.ok && data.ok !== false, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: {
        ok: false,
        error: "bot_unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
