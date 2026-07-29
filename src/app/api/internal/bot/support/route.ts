import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import {
  botSupportCreate,
  botSupportList,
  botSupportReply,
} from "@/lib/telegram/bot-cabinet-service";

export const runtime = "nodejs";

type SupportBody = {
  telegram_user_id?: unknown;
  action?: unknown;
  subject?: unknown;
  message?: unknown;
  ticket_id?: unknown;
};

export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: SupportBody;
  try {
    body = (await request.json()) as SupportBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "list";

  if (action === "list") {
    const result = await botSupportList(telegramUserId);
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === "needs_link" ? 403 : 400 });
    }
    return NextResponse.json(result);
  }

  if (action === "create") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const subject =
      typeof body.subject === "string" && body.subject.trim()
        ? body.subject.trim()
        : message.slice(0, 80) || "Вопрос из Telegram";
    if (message.length < 3) {
      return NextResponse.json(
        { ok: false, error: "invalid", message: "Сообщение слишком короткое." },
        { status: 400 }
      );
    }
    const result = await botSupportCreate({ telegramUserId, subject, message });
    if (!result.ok) {
      const status = result.error === "needs_link" ? 403 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  }

  if (action === "reply") {
    const ticketId = typeof body.ticket_id === "string" ? body.ticket_id.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!ticketId || message.length < 1) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const result = await botSupportReply({ telegramUserId, ticketId, message });
    if (!result.ok) {
      const status =
        result.error === "needs_link" ? 403 : result.error === "not_found" ? 404 : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
}
