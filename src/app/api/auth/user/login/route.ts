import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { findUserByEmail } from "@/lib/accounts";
import { setAuthCookie, verifyPassword, normalizeAuthEmail } from "@/lib/auth";
import { resolveLoginHint, getLoginFormHints, LOGIN_FAILURE_MESSAGE } from "@/lib/login-hints";
import { clientIp, enforceLoginRateLimit } from "@/lib/api-guards";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";

export async function POST(request: NextRequest) {
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const { email: rawEmail, password, recaptchaToken } = await request.json();
    const email = normalizeAuthEmail(String(rawEmail ?? ""));
    if (!email || !password) {
      return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
    }

    const captchaBlock = await enforceRecaptchaScope("login", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    const rateLimited = await enforceLoginRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      const hint = await resolveLoginHint(email, "user");
      return NextResponse.json(
        { error: hint ?? LOGIN_FAILURE_MESSAGE },
        { status: 401 }
      );
    }

    await setAuthCookie(
      {
        sub: user.id,
        role: "user",
        email: user.email,
        name: user.name,
      },
      request
    );

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("User login error:", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}
