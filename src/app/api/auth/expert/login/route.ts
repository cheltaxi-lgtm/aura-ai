import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { findExpertByEmail } from "@/lib/accounts";
import { setAuthCookie, verifyPassword, normalizeAuthEmail } from "@/lib/auth";
import { resolveLoginHint, LOGIN_FAILURE_MESSAGE } from "@/lib/login-hints";
import { clientIp, enforceLoginRateLimit } from "@/lib/api-guards";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";

export async function POST(request: NextRequest) {
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

    const { email: rawEmail, password, recaptchaToken } = await request.json();
    const email = normalizeAuthEmail(String(rawEmail ?? ""));
    if (!email || !password) {
      return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
    }

    const captchaBlock = await enforceRecaptchaScope("expertLogin", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    const rateLimited = await enforceLoginRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    const expert = await findExpertByEmail(email);
    if (!expert || !(await verifyPassword(password, expert.password_hash))) {
      const hint = await resolveLoginHint(email, "expert");
      return NextResponse.json(
        { error: hint ?? LOGIN_FAILURE_MESSAGE },
        { status: 401 }
      );
    }

    await setAuthCookie(
      {
        sub: expert.id,
        role: "expert",
        email: expert.email,
        name: expert.name,
        slug: expert.slug,
      },
      request
    );

    return NextResponse.json({
      ok: true,
      expert: { id: expert.id, email: expert.email, name: expert.name, slug: expert.slug },
    });
  } catch (error) {
    console.error("Expert login error:", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}
