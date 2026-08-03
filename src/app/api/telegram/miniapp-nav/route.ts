import { NextResponse } from "next/server";
import { getAuth } from "@/lib/auth";
import { getTelegramStatusForAccount } from "@/lib/telegram/accounts";
import { takeMiniAppPending } from "@/lib/telegram/miniapp-pending";

export const runtime = "nodejs";

/**
 * Mini App client polls this while open — consumes bot-parked navigation
 * without opening a second WebView.
 */
export async function GET() {
  const user = await getAuth();
  if (!user || user.role !== "user") {
    return NextResponse.json({ ok: false, to: null }, { status: 401 });
  }

  const tg = await getTelegramStatusForAccount(user.sub);
  if (!tg.linked || !tg.telegramUserId) {
    return NextResponse.json({ ok: true, to: null });
  }

  const telegramUserId = Number(tg.telegramUserId);
  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
    return NextResponse.json({ ok: true, to: null });
  }

  const to = await takeMiniAppPending(telegramUserId);
  return NextResponse.json({ ok: true, to });
}
