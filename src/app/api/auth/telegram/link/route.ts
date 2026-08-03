import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Legacy Login Widget bind — disabled (same legal basis as Telegram login). */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "telegram_widget_disabled",
      message:
        "Привязка через виджет Telegram отключена. Откройте бота Zovus и получите ссылку для привязки.",
    },
    { status: 410 }
  );
}
