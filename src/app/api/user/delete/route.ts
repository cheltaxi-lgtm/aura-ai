import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { clearAuthCookie } from "@/lib/auth";
import { requireUserAuth } from "@/lib/require-auth";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { deleteUserAccountCompletely } from "@/lib/user-deletion";

export async function DELETE() {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
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
  await clearAuthCookie();

  return NextResponse.json({ ok: true, ...result });
}
