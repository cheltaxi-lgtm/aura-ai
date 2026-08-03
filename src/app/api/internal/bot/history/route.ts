import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botHistory, botHistoryDelete } from "@/lib/telegram/bot-product-service";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    limit?: unknown;
    action?: unknown;
    session_id?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return NextResponse.json(
      { ok: false, error: "needs_link", linkUrl: resolved.linkUrl },
      { status: 403 }
    );
  }

  const action = typeof body.action === "string" ? body.action : "list";
  if (action === "delete") {
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const result = await botHistoryDelete(resolved.profileUserId, sessionId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, message: "Запись не найдена или уже удалена." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      action: "delete",
      deleted: true,
      runeBalance: resolved.runeBalance,
    });
  }

  const limit = Math.min(40, Math.max(1, Number(body.limit) || 8));
  const history = await botHistory(resolved.profileUserId, limit);
  return NextResponse.json({ ok: true, ...history, runeBalance: resolved.runeBalance });
}
