import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { purgeUserCabinetData } from "@/lib/cabinet-data";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const CONFIRM_PHRASE = "УДАЛИТЬ ВСЁ";

export async function POST(request: NextRequest) {
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
    rateLimitKey("cabinet_purge", auth.sub),
    3,
    86_400_000
  );
  if (!allowed) {
    return NextResponse.json(
      {
        error: "rate_limit",
        message: "Очистку можно выполнять не чаще нескольких раз в сутки.",
        retryAfterSec,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSec ?? 86400) } }
    );
  }

  let confirmPhrase = "";
  try {
    const body = await request.json();
    confirmPhrase = String(body.confirmPhrase ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (confirmPhrase !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: "confirm_required", expected: CONFIRM_PHRASE },
      { status: 400 }
    );
  }

  const result = await purgeUserCabinetData(profileUserId);
  return NextResponse.json({ ok: true, ...result });
}
