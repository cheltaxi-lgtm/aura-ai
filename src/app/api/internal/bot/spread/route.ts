import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botRunVeronikaSpread } from "@/lib/telegram/bot-product-service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { telegram_user_id?: unknown; question?: unknown };
  try {
    body = (await request.json()) as { telegram_user_id?: unknown; question?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  const question = typeof body.question === "string" ? body.question : "";
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const result = await botRunVeronikaSpread({ telegramUserId, question });
  if (!result.ok) {
    const status =
      result.error === "needs_link" || result.error === "needs_onboarding"
        ? 403
        : result.error === "insufficient_runes"
          ? 402
          : result.error === "generation_failed"
            ? 502
            : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
