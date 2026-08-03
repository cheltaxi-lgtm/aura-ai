import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Telegram Stars checkout is retired (starsEnabled: false on /api/internal/bot/runes).
 * Endpoint kept as 410 so old bot builds fail closed instead of minting runes.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: "stars_retired",
      message: "Оплата Stars отключена. Используйте ЮKassa через /api/internal/bot/runes/purchase.",
    },
    { status: 410 }
  );
}
