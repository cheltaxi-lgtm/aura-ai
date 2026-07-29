import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { confirmTelegramAuthChallenge } from "@/lib/telegram/auth-bridge";

export const runtime = "nodejs";

/** Bot confirms a site-issued auth/link challenge after /start a_<token>. */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    token?: unknown;
    telegram_user_id?: unknown;
    username?: unknown;
    first_name?: unknown;
    photo_url?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (!/^[a-f0-9]{32}$/.test(token) || telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const result = await confirmTelegramAuthChallenge({
    token,
    telegramUserId,
    username: typeof body.username === "string" ? body.username : null,
    firstName: typeof body.first_name === "string" ? body.first_name : null,
    photoUrl: typeof body.photo_url === "string" ? body.photo_url : null,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found" ? 404 : result.error === "expired" ? 410 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({ ok: true, purpose: result.purpose });
}
