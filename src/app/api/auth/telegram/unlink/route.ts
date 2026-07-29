import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authRequiredResponse, requireUserAuth } from "@/lib/require-auth";
import { clientIp } from "@/lib/api-guards";
import { unlinkTelegramFromAccount } from "@/lib/telegram/accounts";
import { notifyBotAccountLinked } from "@/lib/telegram/notify-bot-link";

export const runtime = "nodejs";

/** Post-auth only: drop telegram_user_id bind. Site session stays. */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return authRequiredResponse();

  const ip = clientIp(request);
  const rl = await checkRateLimit(rateLimitKey("telegram-unlink", ip), 20, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 600) } }
    );
  }

  const result = await unlinkTelegramFromAccount(auth.sub);
  if (result.telegramUserId != null) {
    void notifyBotAccountLinked({
      telegramUserId: result.telegramUserId,
      profileUserId: null,
    });
  }

  return NextResponse.json({
    ok: true,
    unlinked: result.unlinked,
    message: result.unlinked
      ? "Telegram отвязан. Можно привязать снова через бота."
      : "Telegram не был привязан.",
  });
}
