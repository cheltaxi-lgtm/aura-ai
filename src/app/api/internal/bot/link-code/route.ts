import { NextRequest, NextResponse } from "next/server";
import {
  assertBotInternalAuth,
  parseTelegramUserId,
} from "@/lib/telegram/bot-internal-auth";
import { createBotLinkCode } from "@/lib/telegram/link-code";
import { findTelegramIdentity } from "@/lib/telegram/accounts";

export const runtime = "nodejs";

/** Bot issues a one-time link code; site auth (allowed methods) then binds telegram_user_id. */
export async function POST(request: NextRequest) {
  const auth = assertBotInternalAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    telegram_user_id?: unknown;
    username?: unknown;
    first_name?: unknown;
    photo_url?: unknown;
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

  const existing = await findTelegramIdentity(telegramUserId);
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyLinked: true,
      linkUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "")}/cabinet`,
    });
  }

  try {
    const created = await createBotLinkCode({
      telegramUserId,
      username: typeof body.username === "string" ? body.username : null,
      firstName: typeof body.first_name === "string" ? body.first_name : null,
      photoUrl: typeof body.photo_url === "string" ? body.photo_url : null,
    });
    return NextResponse.json({
      ok: true,
      alreadyLinked: false,
      code: created.code,
      linkUrl: created.linkUrl,
      expiresAt: created.expiresAt,
    });
  } catch (err) {
    console.error("[bot-link-code]", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
