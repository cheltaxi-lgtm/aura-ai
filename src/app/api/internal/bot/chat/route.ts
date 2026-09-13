import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botChatFollowUp, botChatQuote } from "@/lib/telegram/bot-cabinet-service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    session_id?: unknown;
    message?: unknown;
    client_event_id?: unknown;
    action?: unknown;
    expected_cost?: unknown;
  };
  try {
    body = (await request.json()) as {
      telegram_user_id?: unknown;
      session_id?: unknown;
      message?: unknown;
      client_event_id?: unknown;
      action?: unknown;
      expected_cost?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
  const message = typeof body.message === "string" ? body.message : "";
  const clientEventId =
    typeof body.client_event_id === "string" ? body.client_event_id.trim() : "";
  if (telegramUserId == null || !sessionId) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  if (body.action === "quote") {
    const quote = await botChatQuote({ telegramUserId, sessionId });
    return NextResponse.json(quote, { status: quote.ok ? 200 : 400 });
  }

  const result = await botChatFollowUp({
    telegramUserId,
    sessionId,
    message,
    clientEventId: clientEventId || undefined,
    expectedCost:
      typeof body.expected_cost === "number" && Number.isFinite(body.expected_cost)
        ? Math.max(0, Math.trunc(body.expected_cost))
        : undefined,
  });
  if (!result.ok) {
    const status =
      result.error === "needs_link"
        ? 403
        : result.error === "insufficient_runes"
          ? 402
          : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
