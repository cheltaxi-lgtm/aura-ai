import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Legacy confirm-login bridge — disabled. Use POST /api/internal/bot/link-code. */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "telegram_login_disabled" },
    { status: 410 }
  );
}
