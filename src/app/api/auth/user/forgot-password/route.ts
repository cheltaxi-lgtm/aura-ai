import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { normalizeAuthEmail } from "@/lib/auth";
import { validatePasswordLength } from "@/lib/auth-policy";
import { clientIp, enforceLoginRateLimit } from "@/lib/api-guards";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import { requestPasswordReset } from "@/lib/password-reset";

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const email = normalizeAuthEmail(String(body.email ?? ""));
  const recaptchaToken = typeof body.recaptchaToken === "string" ? body.recaptchaToken : undefined;

  if (!email) {
    return NextResponse.json({ error: "Укажите email" }, { status: 400 });
  }

  const captchaBlock = await enforceRecaptchaScope("login", recaptchaToken, request);
  if (captchaBlock) return captchaBlock;

  const rateLimited = await enforceLoginRateLimit(clientIp(request));
  if (rateLimited) return rateLimited;

  await requestPasswordReset(email);

  return NextResponse.json({
    ok: true,
    message: "Если аккаунт существует, мы отправили ссылку для сброса пароля.",
  });
}
