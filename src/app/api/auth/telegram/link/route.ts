import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authRequiredResponse, requireUserAuth } from "@/lib/require-auth";
import { clientIp } from "@/lib/api-guards";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { linkTelegramToAccount } from "@/lib/telegram/accounts";
import { notifyBotAccountLinked } from "@/lib/telegram/notify-bot-link";
import { verifyTelegramLoginWidget } from "@/lib/telegram/verify";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return authRequiredResponse();

  const ip = clientIp(request);
  const rl = await checkRateLimit(rateLimitKey("telegram-link", ip), 20, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 600) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const verified = verifyTelegramLoginWidget(body);
  if (!verified.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await linkTelegramToAccount({
    accountId: auth.sub,
    data: verified.data,
  });

  if (!result.ok) {
    const message =
      result.code === "telegram_taken"
        ? "Этот Telegram уже привязан к другому аккаунту Zovus."
        : "К этому аккаунту уже привязан другой Telegram.";
    return NextResponse.json({ error: result.code, message }, { status: 409 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  void notifyBotAccountLinked({
    telegramUserId: verified.data.id,
    profileUserId,
  });

  return NextResponse.json({
    ok: true,
    alreadyLinked: result.alreadyLinked,
    username: result.username,
  });
}
