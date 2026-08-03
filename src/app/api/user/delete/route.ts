import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { clearAuthCookie } from "@/lib/auth";
import { requireUserAuth } from "@/lib/require-auth";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { clearSessionClaimCookie } from "@/lib/session-claim";
import { deleteUserAccountCompletely, deleteUserAccountOnly } from "@/lib/user-deletion";

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

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
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
    const result = await deleteUserAccountOnly(auth.sub);
    await clearAuthCookie(request);
    await clearSessionClaimCookie(request);
    return NextResponse.json({ ok: true, ...result });
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

  const result = await deleteUserAccountCompletely(auth.sub, profileUserId);
  await clearAuthCookie(request);
  await clearSessionClaimCookie(request);

  return NextResponse.json({ ok: true, ...result });
}
