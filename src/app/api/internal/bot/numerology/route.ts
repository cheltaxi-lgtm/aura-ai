import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { botMatrixAction } from "@/lib/telegram/bot-matrix-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    action?: unknown;
    report_id?: unknown;
  };
  try {
    body = (await request.json()) as {
      telegram_user_id?: unknown;
      action?: unknown;
      report_id?: unknown;
    };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const rawAction = typeof body.action === "string" ? body.action : "summary";
  const action =
    rawAction === "list" || rawAction === "get" || rawAction === "run" || rawAction === "summary"
      ? rawAction
      : "summary";
  const reportId = typeof body.report_id === "string" ? body.report_id : undefined;

  const result = await botMatrixAction({
    telegramUserId,
    action,
    reportId,
  });

  if (!result.ok) {
    const status =
      result.error === "needs_link" || result.error === "needs_onboarding"
        ? 403
        : result.error === "insufficient_runes"
          ? 402
          : result.error === "not_found"
            ? 404
            : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
