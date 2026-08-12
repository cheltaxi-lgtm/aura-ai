import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authRequiredResponse, requireUserAuth } from "@/lib/require-auth";
import { clientIp } from "@/lib/api-guards";
import {
  consumeLinkCodeForAccount,
  isValidLinkCode,
  peekLinkCode,
} from "@/lib/telegram/link-code";

export const runtime = "nodejs";

/** Peek link-code status (no auth). Does not bind. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  if (!isValidLinkCode(code)) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }
  const peek = await peekLinkCode(code);
  return NextResponse.json({
    ok: true,
    status: peek.status,
    telegramUsername: peek.telegramUsername,
    expiresAt: peek.expiresAt,
  });
}

/** Bind telegram from bot-issued code to the currently authenticated site account. */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) return authRequiredResponse();

  const ip = clientIp(request);
  const rl = await checkRateLimit(rateLimitKey("telegram-link-code", ip), 30, 10 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limit", message: "Слишком много попыток. Попробуйте позже." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 600) } }
    );
  }

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!isValidLinkCode(code)) {
    return NextResponse.json({ ok: false, error: "invalid_code" }, { status: 400 });
  }

  const result = await consumeLinkCodeForAccount({ code, accountId: auth.sub });
  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "expired" || result.error === "consumed"
          ? 410
          : result.error === "telegram_taken" || result.error === "account_has_telegram"
            ? 409
            : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({
    ok: true,
    username: result.username,
    alreadyLinked: result.alreadyLinked,
  });
}
