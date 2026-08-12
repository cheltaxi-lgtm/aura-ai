import { NextRequest, NextResponse } from "next/server";
import { findUserById } from "@/lib/accounts";
import { setAuthCookie } from "@/lib/auth";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { clientIp } from "@/lib/api-guards";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import { verifyTelegramWebAppInitData } from "@/lib/telegram/verify";
import { sanitizeMiniAppPath } from "@/lib/telegram/mini-app";
import { takeMiniAppPending } from "@/lib/telegram/miniapp-pending";

export const runtime = "nodejs";

/**
 * Mini App bootstrap auth: verify Telegram initData → mint site session if linked.
 * Does not create accounts and is not Login Widget / «Войти через Telegram».
 * Allowed only for telegram_user_id already bound in user_telegram_identities.
 */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const rl = await checkRateLimit(
    rateLimitKey("telegram-webapp", ip),
    60,
    10 * 60 * 1000
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limit", message: "Слишком много попыток." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 600) } }
    );
  }

  let body: { initData?: unknown; to?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const initData = typeof body.initData === "string" ? body.initData.trim() : "";
  if (!initData || initData.length > 4096) {
    return NextResponse.json({ ok: false, error: "invalid_init_data" }, { status: 400 });
  }

  const verified = verifyTelegramWebAppInitData(initData);
  if (!verified.ok) {
    const status = verified.reason === "not_configured" ? 503 : 401;
    return NextResponse.json(
      { ok: false, error: verified.reason || "invalid_signature" },
      { status }
    );
  }

  const telegramUserId = verified.data.id;
  const resolved = await resolveBotUser(telegramUserId);
  const requested = sanitizeMiniAppPath(
    typeof body.to === "string" ? body.to : "/cabinet"
  );

  if (!resolved.linked || !resolved.accountId) {
    return NextResponse.json({
      ok: false,
      error: "needs_link",
      to: requested,
      linkLoginUrl: `/auth/user/login?returnTo=${encodeURIComponent(requested)}&utm_source=telegram&utm_medium=miniapp&utm_campaign=account_link`,
      message: "Привяжите аккаунт Zovus, чтобы открыть кабинет внутри Telegram.",
    });
  }

  const account = await findUserById(resolved.accountId);
  if (!account) {
    return NextResponse.json({ ok: false, error: "account_missing" }, { status: 404 });
  }

  await setAuthCookie(
    {
      sub: account.id,
      role: "user",
      email: account.email,
      name: account.name,
    },
    request
  );

  const pending = await takeMiniAppPending(telegramUserId);
  const to = sanitizeMiniAppPath(pending || requested);

  return NextResponse.json({
    ok: true,
    to,
    linked: true,
    needsOnboarding: resolved.needsOnboarding,
    name: resolved.name,
  });
}
