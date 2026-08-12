import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { enforceGuestTripletClaimRateLimit } from "@/lib/api-guards";
import { requireUserAuth } from "@/lib/require-auth";
import { findUserById, getProfileUserIdForAccount } from "@/lib/accounts";
import { ensureMinimalConsumerProfile } from "@/lib/users";
import { claimTelegramBotReceipt } from "@/lib/telegram/claim-bot-receipt";
import { isTgReceiptToken } from "@/lib/telegram/bot-receipt-client";

export const runtime = "nodejs";

/**
 * Post-auth claim of a Telegram bot guest receipt (`tg_receipt`).
 * Does not alter the cookie-based web guest claim path.
 */
export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = await enforceGuestTripletClaimRateLimit(auth.sub);
  if (limited) return limited;

  let profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    // Align with web claim: stub consumer profile — birth not required for Tarot.
    const account = await findUserById(auth.sub);
    const stub = await ensureMinimalConsumerProfile({
      accountId: auth.sub,
      name: account?.name || auth.name || "Гость",
    });
    profileUserId = stub.id;
  }

  let body: { tg_receipt?: string; token?: string };
  try {
    body = (await request.json()) as { tg_receipt?: string; token?: string };
  } catch {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const token = (body.tg_receipt || body.token || "").trim();
  if (!isTgReceiptToken(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const result = await claimTelegramBotReceipt({
    token,
    profileUserId,
  });

  if (!result.ok) {
    if (result.code === "expired") {
      return NextResponse.json(
        {
          error: "expired",
          code: "expired",
          message:
            "Срок этого расклада истёк. Можно сделать новый на главной — салон вас ждёт.",
        },
        { status: 410 }
      );
    }
    if (result.code === "already_used") {
      return NextResponse.json(
        {
          error: "already_used",
          code: "already_used",
          message: "Бесплатный гостевой расклад уже использован для этого аккаунта.",
        },
        { status: 409 }
      );
    }
    if (result.code === "unclaimable") {
      return NextResponse.json(
        {
          error: "unclaimable",
          code: "unclaimable",
          message: "Этот расклад нельзя перенести. Сделайте новый в боте или на сайте.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId: result.sessionId,
    alreadyClaimed: result.alreadyClaimed,
    masterId: result.masterId,
    question: result.question,
    system: result.system,
    cards: result.symbols,
    fingerprint: result.fingerprint,
  });
}
