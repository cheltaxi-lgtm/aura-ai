import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import {
  botRunCatalogIntent,
  botRunVeronikaSpread,
} from "@/lib/telegram/bot-product-service";

export const runtime = "nodejs";
/** Large catalog spreads (celtic / year-ahead) need a longer sync budget. */
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    question?: unknown;
    intent_slug?: unknown;
    client_event_id?: unknown;
  };
  try {
    body = (await request.json()) as {
      telegram_user_id?: unknown;
      question?: unknown;
      intent_slug?: unknown;
      client_event_id?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const intentSlug =
    typeof body.intent_slug === "string" ? body.intent_slug.trim() : "";
  const question = typeof body.question === "string" ? body.question : "";
  const clientEventId =
    typeof body.client_event_id === "string"
      ? body.client_event_id.trim()
      : typeof body.client_event_id === "number"
        ? String(body.client_event_id)
        : undefined;

  const result = intentSlug
    ? await botRunCatalogIntent({ telegramUserId, intentSlug, clientEventId })
    : await botRunVeronikaSpread({ telegramUserId, question, clientEventId });

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
