import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botDeleteAccount } from "@/lib/telegram/bot-delete-account";

export const runtime = "nodejs";

/**
 * Bot → site: irreversible full account deletion (same as cabinet DELETE /api/user/delete).
 */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { telegram_user_id?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  if (body.confirm !== true && body.confirm !== "true" && body.confirm !== 1) {
    return NextResponse.json({ ok: false, error: "confirm_required" }, { status: 400 });
  }

  const result = await botDeleteAccount(telegramUserId);
  if (!result.ok) {
    const status =
      result.error === "rate_limit" ? 429 : result.error === "not_linked" ? 404 : 500;
    return NextResponse.json(result, {
      status,
      headers:
        result.error === "rate_limit" && result.retryAfterSec
          ? { "Retry-After": String(result.retryAfterSec) }
          : undefined,
    });
  }
  return NextResponse.json(result);
}
