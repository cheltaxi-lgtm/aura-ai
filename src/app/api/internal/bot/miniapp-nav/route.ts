import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { setMiniAppPending } from "@/lib/telegram/miniapp-pending";

export const runtime = "nodejs";

/** Bot → site: park a destination for the single Mini App shell. */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { telegram_user_id?: unknown; path?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }
  if (typeof body.path !== "string" || !body.path.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
  }

  const path = await setMiniAppPending(telegramUserId, body.path);
  return NextResponse.json({ ok: true, path });
}
