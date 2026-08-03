import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { createExpert, findExpertByEmail } from "@/lib/accounts";
import { validatePasswordLength } from "@/lib/auth-policy";
import { hashPassword, setAuthCookie, slugify } from "@/lib/auth";
import { clientIp, enforceRegisterRateLimit } from "@/lib/api-guards";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import { isExpertRegistrationEnabled } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

    if (!(await isExpertRegistrationEnabled())) {
      return NextResponse.json(
        { error: "Регистрация мастеров временно закрыта" },
        { status: 403 }
      );
    }

    const { email, password, name, slug, title, recaptchaToken, ageConfirmed } = await request.json();
    if (!email || !password || !name) {
      return NextResponse.json({ error: "Заполните обязательные поля" }, { status: 400 });
    }

    if (ageConfirmed !== true) {
      return NextResponse.json(
        { error: "Необходимо подтвердить, что вам исполнилось 18 лет" },
        { status: 400 }
      );
    }

    const captchaBlock = await enforceRecaptchaScope(
      "expertRegister",
      recaptchaToken,
      request
    );
    if (captchaBlock) return captchaBlock;

    const rateLimited = await enforceRegisterRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    const passwordError = validatePasswordLength(String(password));
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const finalSlug = slugify(slug || name);

    const existing = await findExpertByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });
    }

    const expert = await createExpert({
      email,
      passwordHash: await hashPassword(password),
      name: name.trim(),
      slug: finalSlug,
      title: title?.trim(),
    });

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
  } catch (error: unknown) {
    console.error("Expert register error:", error);
    const msg = error instanceof Error && error.message.includes("unique") ? "Slug уже занят" : "Ошибка регистрации";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
