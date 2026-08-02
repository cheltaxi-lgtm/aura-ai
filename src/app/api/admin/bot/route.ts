import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { requireAdminStepUp } from "@/lib/admin-stepup";
import { query } from "@/lib/db";
import {
  callBotAdmin,
  isBotAdminConfigured,
  type BotAdminAction,
} from "@/lib/telegram/bot-admin-client";

async function siteTelegramStats() {
  try {
    const [linked, recent] = await Promise.all([
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM user_telegram_identities`
      ),
      query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM user_telegram_identities
         WHERE linked_at >= NOW() - INTERVAL '7 days'`
      ),
    ]);
    return {
      linkedIdentities: Number(linked.rows[0]?.n ?? 0),
      linkedLast7d: Number(recent.rows[0]?.n ?? 0),
    };
  } catch {
    return { linkedIdentities: null as number | null, linkedLast7d: null as number | null };
  }
}

const MUTATING = new Set<BotAdminAction>(["set_flag", "ban", "unban"]);

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isBotAdminConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "bot_not_configured",
        message:
          "Не заданы BOT_INTERNAL_BASE_URL / BOT_INTERNAL_SECRET — бот недоступен из админки.",
        site: await siteTelegramStats(),
      },
      { status: 503 }
    );
  }

  const actor = auth.email || "admin";
  const [bot, site] = await Promise.all([
    callBotAdmin("dashboard", {}, actor),
    siteTelegramStats(),
  ]);

  if (!bot.ok) {
    return NextResponse.json(
      { ok: false, error: bot.data.error || "bot_error", ...bot.data, site },
      { status: bot.status >= 400 ? bot.status : 502 }
    );
  }

  return NextResponse.json({ ...bot.data, site });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = String(body.action || "") as BotAdminAction;
  const allowed: BotAdminAction[] = [
    "dashboard",
    "users",
    "events",
    "flags",
    "set_flag",
    "ban",
    "unban",
    "user",
  ];
  if (!allowed.includes(action)) {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }

  let auth;
  if (MUTATING.has(action)) {
    const stepped = await requireAdminStepUp(request);
    if (!stepped.ok) return stepped.response;
    auth = stepped.auth;
  } else {
    auth = await requireAdmin();
    if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isBotAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "bot_not_configured" },
      { status: 503 }
    );
  }

  const { action: _a, ...rest } = body;
  const actor = auth.email || "admin";
  const result = await callBotAdmin(action, rest, actor);

  return NextResponse.json(result.data, {
    status: result.ok ? 200 : result.status >= 400 ? result.status : 502,
  });
}
