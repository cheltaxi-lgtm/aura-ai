import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";
import { clientIp, enforceLoginRateLimit, enforceRegisterRateLimit } from "@/lib/api-guards";
import { sendWelcomeEmail } from "@/lib/email/send";
import { loginOrRegisterTelegram } from "@/lib/telegram/accounts";
import { notifyBotAccountLinked } from "@/lib/telegram/notify-bot-link";
import { verifyTelegramLoginWidget } from "@/lib/telegram/verify";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = body.mode === "register" ? "register" : "login";
  const limited =
    mode === "register"
      ? await enforceRegisterRateLimit(ip)
      : await enforceLoginRateLimit(ip);
  if (limited) return limited;

  const verified = verifyTelegramLoginWidget(body);
  if (!verified.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await loginOrRegisterTelegram({
    data: verified.data,
    mode,
    acceptedTerms: body.acceptedTerms === true || body.acceptedTerms === "1",
    ageConfirmed: body.ageConfirmed === true || body.ageConfirmed === "1",
    marketingConsent: body.marketingConsent === true || body.marketingConsent === "1",
  });

  if (!result.ok) {
    if (result.code === "consent_required") {
      return NextResponse.json(
        { error: "consent_required", message: "Подтвердите условия и возраст 18+." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "not_found", message: "Аккаунт с этим Telegram не найден. Зарегистрируйтесь." },
      { status: 404 }
    );
  }

  await setAuthCookie({
    sub: result.accountId,
    role: "user",
    email: result.email,
    name: result.name,
  });

  if (result.isNewUser) {
    void sendWelcomeEmail(result.email, result.name || result.email, {
      needsOnboarding: result.needsProfile,
    });
  }

  void notifyBotAccountLinked({
    telegramUserId: verified.data.id,
    profileUserId: result.profileUserId,
  });

  return NextResponse.json({
    ok: true,
    isNewUser: result.isNewUser,
    needsProfile: result.needsProfile,
    account: { id: result.accountId, email: result.email, name: result.name },
  });
}
