import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { upsertBotOfferProfile } from "@/lib/telegram/bot-offer-account";
import { normalizeUserGender } from "@/lib/russian-name-gender";

export const runtime = "nodejs";

/** Bot → site: complete birth profile for bot-offer accounts. */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    name?: unknown;
    birth_date?: unknown;
    gender?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const telegramUserId = parseTelegramUserId(body.telegram_user_id);
  if (telegramUserId == null) {
    return NextResponse.json({ ok: false, error: "invalid_telegram_user_id" }, { status: 400 });
  }

  const birthDate = typeof body.birth_date === "string" ? body.birth_date.trim() : "";
  const gender = normalizeUserGender(typeof body.gender === "string" ? body.gender : null);
  if (!birthDate || !gender) {
    return NextResponse.json({ ok: false, error: "invalid_profile" }, { status: 400 });
  }

  try {
    const result = await upsertBotOfferProfile({
      telegramUserId,
      name: typeof body.name === "string" ? body.name : null,
      birthDate,
      gender,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "profile_failed";
    console.error("[bot/profile]", err);
    if (msg === "NOT_LINKED") {
      return NextResponse.json({ ok: false, error: "needs_link" }, { status: 403 });
    }
    if (msg === "INVALID_BIRTH_DATE" || msg === "AGE_GATE") {
      return NextResponse.json({ ok: false, error: msg.toLowerCase() }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "profile_failed" }, { status: 500 });
  }
}
