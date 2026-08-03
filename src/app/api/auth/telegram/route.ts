import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Disabled for compliance (149-FZ art.8 p.10): Telegram must not authenticate users.
 * Account linking uses bot-issued link codes after Russian-allowed site auth.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "telegram_login_disabled",
      message:
        "Вход через Telegram недоступен. Войдите через email, Яндекс или VK, затем привяжите Telegram в кабинете или через бота.",
    },
    { status: 410 }
  );
}
