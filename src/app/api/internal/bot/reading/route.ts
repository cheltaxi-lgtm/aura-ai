import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botReadingDetail } from "@/lib/telegram/bot-product-service";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { telegram_user_id?: unknown; session_id?: unknown };
  try {
    body = (await request.json()) as { telegram_user_id?: unknown; session_id?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  if (telegramUserId == null || !sessionId) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.profileUserId) {
    return NextResponse.json(
      { ok: false, error: "needs_link", linkUrl: resolved.linkUrl },
      { status: 403 }
    );
  }

  const detail = await botReadingDetail(resolved.profileUserId, sessionId);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
