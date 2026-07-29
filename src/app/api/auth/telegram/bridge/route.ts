import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Legacy site→bot login bridge — disabled. Use bot-issued link codes only. */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "telegram_login_disabled",
      message:
        "Вход через Telegram недоступен. Авторизуйтесь на сайте разрешённым способом, затем привяжите Telegram через бота.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "telegram_login_disabled" },
    { status: 410 }
  );
}
