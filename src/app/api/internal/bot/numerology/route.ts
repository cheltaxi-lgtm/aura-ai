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
    replace?: unknown;
    operation_id?: unknown;
    subject_id?: unknown;
    kind?: unknown;
    display_name?: unknown;
    birth_date?: unknown;
  };
  try {
    body = (await request.json()) as {
      telegram_user_id?: unknown;
      action?: unknown;
      report_id?: unknown;
      replace?: unknown;
      operation_id?: unknown;
      subject_id?: unknown;
      kind?: unknown;
      display_name?: unknown;
      birth_date?: unknown;
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
    rawAction === "list" ||
    rawAction === "get" ||
    rawAction === "run" ||
    rawAction === "delete" ||
    rawAction === "summary"
    || rawAction === "subjects"
    || rawAction === "subjects.list"
    || rawAction === "subjects.create"
    || rawAction === "subjects.delete"
      ? rawAction
      : "summary";
  const reportId = typeof body.report_id === "string" ? body.report_id : undefined;
  const replace = body.replace === true || body.replace === "true" || body.replace === 1;

  const result = await botMatrixAction({
    telegramUserId,
    action,
    reportId,
    replace,
    operationId: typeof body.operation_id === "string" ? body.operation_id : undefined,
    subjectId: typeof body.subject_id === "string" ? body.subject_id : undefined,
    kind: typeof body.kind === "string" ? body.kind : undefined,
    displayName: typeof body.display_name === "string" ? body.display_name : undefined,
    birthDate: typeof body.birth_date === "string" ? body.birth_date : undefined,
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
