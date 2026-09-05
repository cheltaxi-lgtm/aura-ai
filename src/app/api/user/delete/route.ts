import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { clearAuthCookie } from "@/lib/auth";
import { requireUserAuth } from "@/lib/require-auth";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { clearSessionClaimCookie } from "@/lib/session-claim";
import { requestAccountErasure } from "@/lib/account-erasure";

const CONFIRM_PHRASE = "УДАЛИТЬ";

export async function DELETE(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  let confirmPhrase = "";
  try {
    const body = (await request.json()) as { confirmPhrase?: string };
    confirmPhrase = typeof body.confirmPhrase === "string" ? body.confirmPhrase.trim() : "";
  } catch {
    confirmPhrase = "";
  }

  if (confirmPhrase !== CONFIRM_PHRASE) {
    return NextResponse.json(
      {
        error: "confirm_required",
        message: `Для удаления введите слово ${CONFIRM_PHRASE}`,
      },
      { status: 400 }
    );
  }

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("user_delete", auth.sub),
    3,
    86_400_000
  );
  if (!allowed) {
    return NextResponse.json(
      {
        error: "rate_limit",
        message: "Удаление аккаунта можно выполнять не чаще нескольких раз в сутки.",
        retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 86400) } }
    );
  }

  let result;
  try {
    result = await requestAccountErasure(auth.sub);
  } catch {
    return NextResponse.json({
      error: "account_cleanup_unavailable",
      message: "Не удалось принять запрос на удаление. Попробуйте позже.",
    }, { status: 503 });
  }
  await clearAuthCookie(request);
  await clearSessionClaimCookie(request);
  return NextResponse.json({
    ok: true, ...result,
    message: "Удаление началось. Доступ к аккаунту закрыт; данные на сайте и в Telegram будут очищены автоматически.",
  }, { status: 202 });
}
