import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { purgeAllUserMemory } from "@/lib/memory/user-facts";
import { recordMemoryProductEvent } from "@/lib/memory/product-analytics";

/**
 * Self-service full memory wipe (facts + session summaries) — the user-facing
 * counterpart to the admin-only purge. Closes a real gap: the PD-consent copy
 * shown before saving a fact (see CabinetMemoryFacts.tsx) explicitly tells the
 * user they can withdraw consent "удалением фактов, очисткой памяти или
 * аккаунта (152-ФЗ)", but until this route existed the only way to actually
 * clear *all* memory was to ask an admin. Does not touch chat history, session
 * list, or the account itself — matches purgeAllUserMemory's scope exactly.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("memory_purge_all", auth.sub),
    5,
    60 * 60 * 1000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit", retryAfterSec, message: "Слишком много попыток. Попробуйте позже." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: "confirm_required", message: "Требуется подтверждение очистки памяти." },
      { status: 422 }
    );
  }

  const { factsRemoved, sessionMemoriesRemoved } = await purgeAllUserMemory(profileUserId);
  void recordMemoryProductEvent({
    event: "memory_purged",
    userId: profileUserId,
    accountId: auth.sub,
    sourceType: "cabinet",
    memoryEnabled: false,
    autoCaptureEnabled: false,
    numericValue: factsRemoved + sessionMemoriesRemoved,
  });
  return NextResponse.json({
    ok: true,
    factsRemoved,
    sessionMemoriesRemoved,
    deleted: factsRemoved + sessionMemoriesRemoved,
  });
}
