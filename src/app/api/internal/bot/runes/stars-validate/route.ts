import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Telegram Stars checkout is retired (starsEnabled: false).
 * Reject pre_checkout_query validation the same way as stars-credit.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      ok: false,
      error: "stars_retired",
      message: "Оплата Stars отключена. Используйте ЮKassa.",
    },
    { status: 410 }
  );
}
