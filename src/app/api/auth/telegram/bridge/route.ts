import { NextRequest, NextResponse } from "next/server";
import { setAuthCookie } from "@/lib/auth";
import { clientIp, enforceLoginRateLimit, enforceRegisterRateLimit } from "@/lib/api-guards";
import { sendWelcomeEmail } from "@/lib/email/send";
import { requireUserAuth } from "@/lib/require-auth";
import {
  createTelegramAuthChallenge,
  getTelegramAuthChallenge,
  challengeToLoginPayload,
  markTelegramAuthChallengeConsumed,
  type BridgePurpose,
} from "@/lib/telegram/auth-bridge";
import {
  linkTelegramToAccount,
  loginOrRegisterTelegram,
} from "@/lib/telegram/accounts";
import { notifyBotAccountLinked } from "@/lib/telegram/notify-bot-link";
import { getProfileUserIdForAccount } from "@/lib/accounts";

export const runtime = "nodejs";

/** Start a bot deep-link auth/link challenge (Login Widget independent). */
export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const purposeRaw = typeof body.purpose === "string" ? body.purpose : "login";
  const purpose = (
    purposeRaw === "register" || purposeRaw === "link" ? purposeRaw : "login"
  ) as BridgePurpose;

  if (purpose === "register") {
    const limited = await enforceRegisterRateLimit(ip);
    if (limited) return limited;
  } else {
    const limited = await enforceLoginRateLimit(ip);
    if (limited) return limited;
  }

  let userAccountId: string | null = null;
  if (purpose === "link") {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    userAccountId = auth.sub;
  }

  if (purpose === "register") {
    const acceptedTerms = body.acceptedTerms === true || body.acceptedTerms === "1";
    const ageConfirmed = body.ageConfirmed === true || body.ageConfirmed === "1";
    if (!acceptedTerms || !ageConfirmed) {
      return NextResponse.json(
        { ok: false, error: "consent_required", message: "Подтвердите условия и возраст 18+." },
        { status: 400 }
      );
    }
  }

  try {
    const challenge = await createTelegramAuthChallenge({
      purpose,
      userAccountId,
      acceptedTerms: body.acceptedTerms === true || body.acceptedTerms === "1",
      ageConfirmed: body.ageConfirmed === true || body.ageConfirmed === "1",
      marketingConsent: body.marketingConsent === true || body.marketingConsent === "1",
    });
    return NextResponse.json({
      ok: true,
      token: challenge.token,
      deepLink: challenge.deepLink,
      expiresAt: challenge.expiresAt,
      purpose: challenge.purpose,
    });
  } catch (err) {
    console.error("[telegram-bridge] create", err);
    return NextResponse.json(
      { ok: false, error: "internal", message: "Не удалось начать вход через Telegram." },
      { status: 500 }
    );
  }
}

/** Poll challenge status; when confirmed, complete login/link and set cookie. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() || "";
  if (!/^[a-f0-9]{32}$/.test(token)) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }

  const challenge = await getTelegramAuthChallenge(token);
  if (!challenge) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (challenge.status !== "confirmed") {
    return NextResponse.json({
      ok: true,
      status: challenge.status,
      purpose: challenge.purpose,
      expiresAt: challenge.expiresAt,
    });
  }

  const payload = challengeToLoginPayload(challenge);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "incomplete" }, { status: 400 });
  }

  if (challenge.purpose === "link") {
    if (!challenge.userAccountId) {
      return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
    }
    const linked = await linkTelegramToAccount({
      accountId: challenge.userAccountId,
      data: payload,
    });
    if (!linked.ok) {
      const message =
        linked.code === "telegram_taken"
          ? "Этот Telegram уже привязан к другому аккаунту."
          : "К аккаунту уже привязан другой Telegram.";
      return NextResponse.json({ ok: false, error: linked.code, message }, { status: 409 });
    }
    await markTelegramAuthChallengeConsumed(token);
    const profileUserId = await getProfileUserIdForAccount(challenge.userAccountId);
    void notifyBotAccountLinked({
      telegramUserId: payload.id,
      profileUserId,
    });
    return NextResponse.json({
      ok: true,
      status: "consumed",
      purpose: "link",
      username: linked.username,
      alreadyLinked: linked.alreadyLinked,
    });
  }

  const result = await loginOrRegisterTelegram({
    data: payload,
    mode: challenge.purpose === "register" ? "register" : "login",
    acceptedTerms: challenge.acceptedTerms,
    ageConfirmed: challenge.ageConfirmed,
    marketingConsent: challenge.marketingConsent,
  });

  if (!result.ok) {
    if (result.code === "consent_required") {
      return NextResponse.json(
        { ok: false, error: "consent_required", message: "Подтвердите условия и возраст 18+." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "not_found",
        message: "Аккаунт с этим Telegram не найден. Зарегистрируйтесь через Telegram.",
      },
      { status: 404 }
    );
  }

  await setAuthCookie({
    sub: result.accountId,
    role: "user",
    email: result.email,
    name: result.name,
  });
  await markTelegramAuthChallengeConsumed(token);

  if (result.isNewUser) {
    void sendWelcomeEmail(result.email, result.name || result.email, {
      needsOnboarding: result.needsProfile,
    });
  }
  void notifyBotAccountLinked({
    telegramUserId: payload.id,
    profileUserId: result.profileUserId,
  });

  return NextResponse.json({
    ok: true,
    status: "consumed",
    purpose: challenge.purpose,
    isNewUser: result.isNewUser,
    needsProfile: result.needsProfile,
    account: { id: result.accountId, email: result.email, name: result.name },
  });
}
